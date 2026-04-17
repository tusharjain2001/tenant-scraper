"""
Google Maps Places API scraper — parameterized by market
Supports: dubai, uk, us (agencies) + configurable city lists
"""
import time
import random
import re
import sys
import requests
from rich.console import Console
from config import GOOGLE_MAPS_API_KEY

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

console = Console(highlight=False)

PLACES_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAIL_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# ── Market presets ─────────────────────────────────────────────────────────────
MARKET_QUERIES = {
    "dubai": [
        "property management company Dubai",
        "real estate letting agency Dubai",
        "residential property rental agency Dubai",
        "property leasing company Dubai Marina",
        "property leasing company Downtown Dubai",
        "property leasing company Business Bay Dubai",
        "property leasing company Jumeirah Dubai",
        "property leasing company JBR Dubai",
    ],
    "uk": [
        "letting agent London",
        "property management company London",
        "residential letting agency West London",
        "residential letting agency East London",
        "residential letting agency North London",
        "residential letting agency South London",
        "estate agent rental London",
        "letting agent Manchester",
        "letting agent Birmingham",
    ],
    "us": [
        "property management company New York",
        "residential property manager Manhattan",
        "property management Brooklyn New York",
        "property management company Miami",
        "property management company Dallas",
        "property management company Houston",
        "property management company Austin",
        "property management company Orlando",
        "property management company Tampa",
        "property management company Phoenix",
        "property management company Los Angeles",
        "property management company Chicago",
    ],
}

# Market → city → detected city label
MARKET_CITY_MAP = {
    "dubai": ["Dubai", "Abu Dhabi", "Sharjah"],
    "uk":    ["London", "Manchester", "Birmingham", "Leeds", "Bristol"],
    "us":    ["New York", "Manhattan", "Brooklyn", "Miami", "Dallas", "Houston",
              "Austin", "Orlando", "Tampa", "Phoenix", "Los Angeles", "Chicago"],
}


def _detect_city(location: str, market: str) -> str:
    known = MARKET_CITY_MAP.get(market, [])
    parts = location.split(",")
    for part in parts:
        p = part.strip()
        for city in known:
            if city.lower() in p.lower():
                return city
    return parts[1].strip() if len(parts) > 1 else parts[0].strip()


def _search_places(session, query, page_token=None):
    params = {"key": GOOGLE_MAPS_API_KEY, "query": query, "type": "real_estate_agency"}
    if page_token:
        params["pagetoken"] = page_token
    resp = session.get(PLACES_SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _get_place_details(session, place_id):
    params = {
        "key": GOOGLE_MAPS_API_KEY,
        "place_id": place_id,
        "fields": "name,formatted_phone_number,international_phone_number,website,formatted_address,business_status",
    }
    resp = session.get(PLACES_DETAIL_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json().get("result", {})


def _extract_email(session, url):
    if not url:
        return ""
    try:
        resp = session.get(url, timeout=15, allow_redirects=True)
        emails = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", resp.text)
        skip = {"noreply", "no-reply", "support@sentry", "example", "test@", "info@example", "user@"}
        for email in emails:
            if not any(s in email.lower() for s in skip):
                return email.lower()
    except Exception:
        pass
    return ""


def run(market="dubai", queries=None, max_pages=3) -> list[dict]:
    """
    market: 'dubai' | 'uk' | 'us'
    queries: override the default query list for this market
    max_pages: max Google Maps pages per query (1 page = 20 results)
    """
    if not GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY == "YOUR_GOOGLE_MAPS_API_KEY":
        console.print("[red]GOOGLE_MAPS_API_KEY not set in .env[/red]")
        return []

    search_queries = queries or MARKET_QUERIES.get(market, MARKET_QUERIES["dubai"])
    contacts = []
    seen_place_ids = set()

    console.print(f"[bold cyan]Google Maps scraper — market: {market}[/bold cyan]")
    console.print(f"  Queries: {len(search_queries)}")

    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (compatible; LeadScraper/2.0)"

    for search_query in search_queries:
        console.print(f"\n  [yellow]{search_query}[/yellow]")
        next_page_token = None
        page_count = 0

        while page_count < max_pages:
            try:
                data = _search_places(session, search_query, next_page_token)
                status = data.get("status")
                if status not in ("OK", "ZERO_RESULTS"):
                    console.print(f"  [red]API error: {status}[/red]")
                    break

                results = data.get("results", [])
                console.print(f"    Page {page_count + 1}: {len(results)} results")

                for place in results:
                    place_id = place.get("place_id")
                    if not place_id or place_id in seen_place_ids:
                        continue
                    seen_place_ids.add(place_id)

                    details = _get_place_details(session, place_id)
                    time.sleep(0.2)

                    website = details.get("website", "")
                    phone   = details.get("international_phone_number", "") or details.get("formatted_phone_number", "")
                    address = details.get("formatted_address", place.get("formatted_address", ""))
                    email   = ""
                    if website:
                        email = _extract_email(session, website)
                        time.sleep(random.uniform(0.5, 1.5))

                    city = _detect_city(address, market)

                    contact = {
                        "source":       "google_maps",
                        "market":       market,
                        "lead_type":    "agency",
                        "listing_url":  website,
                        "agent_name":   "",
                        "agency_name":  place.get("name", ""),
                        "phone":        phone,
                        "email":        email,
                        "location":     address,
                        "city":         city,
                        "search_query": search_query,
                        "google_rating": place.get("rating", ""),
                    }
                    contacts.append(contact)

                    icon = "[green]OK[/green]" if email or phone else "[yellow]--[/yellow]"
                    safe = contact["agency_name"].encode("ascii", "replace").decode("ascii")
                    console.print(f"    {icon} {safe} | {phone} | {email or '(no email)'}")

                next_page_token = data.get("next_page_token")
                if not next_page_token:
                    break
                page_count += 1
                time.sleep(2.5)

            except Exception as e:
                console.print(f"  [red]Error: {e}[/red]")
                break

        time.sleep(random.uniform(1.0, 2.0))

    console.print(f"\n[green]{market.upper()}: {len(contacts)} agencies[/green]")
    return contacts
