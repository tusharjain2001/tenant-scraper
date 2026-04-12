"""
Zoopla (UK) — internal JSON API scraper
Zoopla's search endpoint returns JSON used by their React frontend.
"""
import time
import random
import requests
from rich.console import Console
from config import ZOOPLA_CONFIG

console = Console()

# Zoopla's internal search API
API_URL = "https://api.zoopla.co.uk/api/v1/property_listings.json"

# Fallback: their newer internal endpoint
ALT_API_URL = "https://www.zoopla.co.uk/search-results/property/to-rent/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html,application/xhtml+xml,*/*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Referer": "https://www.zoopla.co.uk/to-rent/property/london/",
}

# Zoopla public API key (free tier — 100 req/day)
ZOOPLA_API_KEY = "YOUR_ZOOPLA_API_KEY"  # get free at https://developer.zoopla.co.uk/


def _try_public_api(session: requests.Session, page: int) -> list[dict]:
    """Try Zoopla's official public API first (requires free API key)."""
    if ZOOPLA_API_KEY == "YOUR_ZOOPLA_API_KEY":
        return []

    params = {
        "api_key": ZOOPLA_API_KEY,
        "listing_status": "rent",
        "area": "London",
        "order_by": "age",
        "ordering": "descending",
        "page_number": page,
        "page_size": 25,
    }
    try:
        resp = session.get(API_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("listing", [])
    except Exception as e:
        console.print(f"  [yellow]Public API failed: {e}[/yellow]")
        return []


def _try_internal_api(session: requests.Session, page: int) -> list[dict]:
    """Try Zoopla's internal search API (no key needed, may return JSON)."""
    params = {
        "q": "London",
        "results_sort": "newest_listings",
        "search_source": "to-rent",
        "pn": page,
        "view_type": "list",
    }
    try:
        headers = {**HEADERS, "Accept": "application/json"}
        resp = session.get(
            "https://www.zoopla.co.uk/to-rent/property/london/",
            params=params,
            headers=headers,
            timeout=30,
        )

        # If we get JSON back
        if "application/json" in resp.headers.get("content-type", ""):
            data = resp.json()
            return data.get("listings", []) or data.get("listing", [])

        # If HTML, try to find __NEXT_DATA__ JSON embedded in page
        if "__NEXT_DATA__" in resp.text:
            import json, re
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', resp.text, re.DOTALL)
            if match:
                next_data = json.loads(match.group(1))
                # Navigate the Next.js data tree to find listings
                props = next_data.get("props", {}).get("pageProps", {})
                listings = (
                    props.get("listings", [])
                    or props.get("searchResults", {}).get("listings", [])
                    or props.get("regularListings", [])
                    or []
                )
                return listings

    except Exception as e:
        console.print(f"  [yellow]Internal API attempt failed: {e}[/yellow]")

    return []


def _extract_contact_public_api(listing: dict) -> dict:
    """Parse a listing from Zoopla's official public API format."""
    contact = {
        "source": "zoopla",
        "listing_url": listing.get("details_url", ""),
        "agent_name": listing.get("agent_name", "") or listing.get("agent_address", ""),
        "agency_name": listing.get("agent_name", ""),
        "phone": listing.get("agent_phone", ""),
        "email": "",
        "listing_title": listing.get("title", ""),
        "property_type": listing.get("property_type", ""),
        "location": listing.get("displayable_address", ""),
    }
    return contact


def _extract_contact_internal(listing: dict) -> dict:
    """Parse a listing from Zoopla's internal/Next.js data format."""
    contact = {
        "source": "zoopla",
        "listing_url": "",
        "agent_name": "",
        "agency_name": "",
        "phone": "",
        "email": "",
        "listing_title": "",
        "property_type": "",
        "location": "",
    }

    # URL
    slug = listing.get("listingUris", {}).get("detail", "") or listing.get("link", "")
    if slug:
        contact["listing_url"] = f"https://www.zoopla.co.uk{slug}" if not slug.startswith("http") else slug

    # Title
    contact["listing_title"] = listing.get("title", "") or listing.get("displayAddress", "")
    contact["location"] = listing.get("address", {}).get("displayAddress", "") if isinstance(listing.get("address"), dict) else listing.get("displayAddress", "")
    contact["property_type"] = listing.get("propertyType", "") or listing.get("property_type", "")

    # Branch / agency
    branch = listing.get("branch", {}) or listing.get("agent", {}) or {}
    contact["agency_name"] = branch.get("name", "") or branch.get("branchName", "")
    contact["phone"] = branch.get("phone", "") or branch.get("phoneNumber", "")
    contact["email"] = branch.get("email", "") or ""

    # Agent (individual)
    agents = listing.get("agents", []) or []
    if agents and isinstance(agents, list):
        agent = agents[0]
        contact["agent_name"] = agent.get("name", "")
        if not contact["phone"]:
            contact["phone"] = agent.get("phone", "") or ""
        if not contact["email"]:
            contact["email"] = agent.get("email", "") or ""

    return contact


def run() -> list[dict]:
    contacts = []
    cfg = ZOOPLA_CONFIG

    console.print("[bold cyan]Zoopla scraper starting...[/bold cyan]")

    session = requests.Session()
    session.headers.update(HEADERS)

    for page_num in range(1, cfg["max_pages"] + 1):
        console.print(f"  Page {page_num}/{cfg['max_pages']}...")

        # Try official API first
        listings = _try_public_api(session, page_num)
        is_public_api = bool(listings)

        # Fall back to internal API
        if not listings:
            listings = _try_internal_api(session, page_num)

        if not listings:
            import json, os
            os.makedirs("output/debug", exist_ok=True)
            console.print(f"  [yellow]No listings on page {page_num}. Saving debug info...[/yellow]")
            # Save raw attempt for analysis
            try:
                resp = session.get(
                    "https://www.zoopla.co.uk/to-rent/property/london/",
                    params={"pn": page_num},
                    timeout=30,
                )
                with open(f"output/debug/zoopla_page{page_num}.html", "w", encoding="utf-8") as f:
                    f.write(resp.text)
                console.print(f"  Saved to output/debug/zoopla_page{page_num}.html ({len(resp.text)} bytes)")
                console.print(f"  Page title hint: {resp.text[resp.text.find('<title>'):resp.text.find('</title>')+8]}")
            except Exception as e:
                console.print(f"  [red]Could not save debug: {e}[/red]")
            break

        console.print(f"  Got {len(listings)} listings")

        for listing in listings:
            if is_public_api:
                contact = _extract_contact_public_api(listing)
            else:
                contact = _extract_contact_internal(listing)

            if contact["agency_name"] or contact["phone"] or contact["agent_name"]:
                contacts.append(contact)

        time.sleep(random.uniform(1.5, 3.0))

    console.print(f"[green]Zoopla: {len(contacts)} contacts collected[/green]")
    return contacts
