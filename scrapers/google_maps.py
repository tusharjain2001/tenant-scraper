"""
Google Maps Places API scraper
Searches for property management companies / letting agents in target cities.
Returns: agency name, phone, website, address, rating.
Then a second pass visits each website to extract email addresses.

Setup: Get a free Google Maps API key at https://console.cloud.google.com/
- Enable "Places API" (legacy) in your project
- Free tier: $200/month credit (~28,000 searches)

Set your key in config.py as GOOGLE_MAPS_API_KEY
"""
import time
import random
import re
import sys
import requests
from rich.console import Console
from config import GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_SEARCHES

# Force UTF-8 output on Windows to handle Arabic / special chars in agency names
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

console = Console(highlight=False)

PLACES_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAIL_URL = "https://maps.googleapis.com/maps/api/place/details/json"


def _search_places(session: requests.Session, query: str, page_token: str = None) -> dict:
    params = {
        "key": GOOGLE_MAPS_API_KEY,
        "query": query,
        "type": "real_estate_agency",
    }
    if page_token:
        params["pagetoken"] = page_token

    resp = session.get(PLACES_SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _get_place_details(session: requests.Session, place_id: str) -> dict:
    params = {
        "key": GOOGLE_MAPS_API_KEY,
        "place_id": place_id,
        "fields": "name,formatted_phone_number,international_phone_number,website,formatted_address,business_status",
    }
    resp = session.get(PLACES_DETAIL_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("result", {})


def _extract_email_from_website(session: requests.Session, url: str) -> str:
    """Fetch homepage and extract first email address found."""
    if not url:
        return ""
    try:
        resp = session.get(url, timeout=15, allow_redirects=True)
        # Look for email addresses in the HTML
        emails = re.findall(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
            resp.text,
        )
        # Filter out common non-human emails
        skip = {"noreply", "no-reply", "support@sentry", "example", "test@", "info@example", "user@", "email@"}
        for email in emails:
            if not any(s in email.lower() for s in skip):
                return email.lower()
    except Exception:
        pass
    return ""


def run() -> list[dict]:
    if GOOGLE_MAPS_API_KEY == "YOUR_GOOGLE_MAPS_API_KEY":
        console.print("[red]Google Maps API key not set! Edit config.py and add your GOOGLE_MAPS_API_KEY[/red]")
        console.print("  Get a free key at: https://console.cloud.google.com/")
        console.print("  Enable 'Places API' and set GOOGLE_MAPS_API_KEY in config.py")
        return []

    contacts = []
    seen_place_ids = set()

    console.print("[bold cyan]Google Maps Places scraper starting...[/bold cyan]")
    console.print(f"  Searches configured: {len(GOOGLE_MAPS_SEARCHES)}")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; TenantScraper/1.0)",
    })

    for search_query in GOOGLE_MAPS_SEARCHES:
        console.print(f"\n  Searching: [yellow]{search_query}[/yellow]")

        next_page_token = None
        page_count = 0

        while page_count < 3:  # Google Maps max 3 pages (60 results) per query
            try:
                data = _search_places(session, search_query, next_page_token)

                status = data.get("status")
                if status not in ("OK", "ZERO_RESULTS"):
                    console.print(f"  [red]API error: {status} — {data.get('error_message', '')}[/red]")
                    break

                results = data.get("results", [])
                console.print(f"    Page {page_count + 1}: {len(results)} results")

                for place in results:
                    place_id = place.get("place_id")
                    if not place_id or place_id in seen_place_ids:
                        continue
                    seen_place_ids.add(place_id)

                    # Get full details (phone + website)
                    details = _get_place_details(session, place_id)
                    time.sleep(0.2)  # small delay between detail calls

                    website = details.get("website", "")
                    phone = (
                        details.get("international_phone_number", "")
                        or details.get("formatted_phone_number", "")
                    )

                    # Try to find email from website
                    email = ""
                    if website:
                        email = _extract_email_from_website(session, website)
                        time.sleep(random.uniform(0.5, 1.5))

                    contact = {
                        "source": "google_maps",
                        "listing_url": website,
                        "agent_name": "",
                        "agency_name": place.get("name", ""),
                        "phone": phone,
                        "email": email,
                        "listing_title": "",
                        "property_type": "agency",
                        "location": details.get("formatted_address", place.get("formatted_address", "")),
                        "search_query": search_query,
                        "google_rating": place.get("rating", ""),
                    }

                    contacts.append(contact)
                    status_icon = "[green]OK[/green]" if email or phone else "[yellow]--[/yellow]"
                    safe_name = contact['agency_name'].encode('ascii', 'replace').decode('ascii')
                    console.print(f"    {status_icon} {safe_name} | {phone} | {email or '(no email)'}")

                next_page_token = data.get("next_page_token")
                if not next_page_token:
                    break

                page_count += 1
                # Google requires 2s delay before using next_page_token
                time.sleep(2.5)

            except requests.HTTPError as e:
                console.print(f"  [red]HTTP error: {e}[/red]")
                break
            except Exception as e:
                console.print(f"  [red]Error: {e}[/red]")
                break

        time.sleep(random.uniform(1.0, 2.0))

    console.print(f"\n[green]Google Maps: {len(contacts)} agencies collected[/green]")
    with_email = sum(1 for c in contacts if c.get("email"))
    with_phone = sum(1 for c in contacts if c.get("phone"))
    console.print(f"  With email: {with_email} | With phone: {with_phone}")
    return contacts
