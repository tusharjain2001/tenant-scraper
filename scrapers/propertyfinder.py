"""
Property Finder (Dubai) — REST API scraper
Property Finder exposes a JSON API used by their own website.
"""
import time
import random
import requests
from rich.console import Console
from config import PROPERTY_FINDER_CONFIG

console = Console()

API_URL = "https://www.propertyfinder.ae/en/api/v2/properties/search"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.propertyfinder.ae/en/search?c=2&t=1&ob=nd&page=1",
    "Origin": "https://www.propertyfinder.ae",
    "X-Requested-With": "XMLHttpRequest",
}


def _build_params(page: int) -> dict:
    return {
        "c": "2",        # residential
        "t": "1",        # rent
        "ob": "nd",      # newest first
        "page": str(page),
        "locale": "en",
    }


def _extract_contact(prop: dict) -> dict:
    contact = {
        "source": "propertyfinder",
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
    slug = prop.get("slug", "") or prop.get("id", "")
    if slug:
        contact["listing_url"] = f"https://www.propertyfinder.ae/en/property-for-rent/{slug}.html"

    # Title
    contact["listing_title"] = prop.get("title", "") or prop.get("name", "")

    # Property type
    contact["property_type"] = (prop.get("type", {}) or {}).get("name", "")

    # Location
    loc = prop.get("location", {}) or {}
    parts = [loc.get("community", ""), loc.get("city", "")]
    contact["location"] = ", ".join(p for p in parts if p)

    # Agent
    agent = prop.get("agent", {}) or {}
    contact["agent_name"] = agent.get("name", "") or agent.get("fullName", "")
    contact["email"] = agent.get("email", "") or ""
    ph = agent.get("phone", "") or agent.get("mobile", "") or ""
    contact["phone"] = ph

    # Agency / broker
    agency = prop.get("agency", {}) or prop.get("broker", {}) or {}
    contact["agency_name"] = agency.get("name", "") or agency.get("title", "")
    if not contact["phone"]:
        contact["phone"] = agency.get("phone", "") or ""
    if not contact["email"]:
        contact["email"] = agency.get("email", "") or ""

    return contact


def run() -> list[dict]:
    contacts = []
    cfg = PROPERTY_FINDER_CONFIG

    console.print("[bold cyan]Property Finder API scraper starting...[/bold cyan]")

    session = requests.Session()
    session.headers.update(HEADERS)

    for page_num in range(1, cfg["max_pages"] + 1):
        console.print(f"  Page {page_num}/{cfg['max_pages']}...")
        try:
            params = _build_params(page_num)
            resp = session.get(API_URL, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            # Try different response shapes
            properties = (
                data.get("properties")
                or data.get("listings")
                or data.get("results")
                or data.get("data", {}).get("properties")
                or data.get("data", {}).get("listings")
                or []
            )

            if not properties:
                console.print(f"  [yellow]No listings on page {page_num}. Response keys: {list(data.keys())}[/yellow]")
                # Save raw response for debugging
                import json, os
                os.makedirs("output/debug", exist_ok=True)
                with open(f"output/debug/pf_page{page_num}.json", "w") as f:
                    json.dump(data, f, indent=2)
                console.print(f"  Saved raw response to output/debug/pf_page{page_num}.json")
                break

            console.print(f"  Got {len(properties)} listings")

            for prop in properties:
                contact = _extract_contact(prop)
                if contact["agent_name"] or contact["phone"] or contact["agency_name"]:
                    contacts.append(contact)

            time.sleep(random.uniform(1.0, 2.5))

        except requests.HTTPError as e:
            console.print(f"  [red]HTTP {e.response.status_code} on page {page_num}: {e}[/red]")
            import json, os
            os.makedirs("output/debug", exist_ok=True)
            with open(f"output/debug/pf_error_page{page_num}.txt", "w") as f:
                f.write(f"Status: {e.response.status_code}\n{e.response.text[:3000]}")
            console.print(f"  Saved error response to output/debug/pf_error_page{page_num}.txt")
            if e.response.status_code in (429, 403):
                console.print("  [yellow]Rate limited — waiting 30s...[/yellow]")
                time.sleep(30)
            break
        except Exception as e:
            console.print(f"  [red]Error on page {page_num}: {e}[/red]")

    console.print(f"[green]Property Finder: {len(contacts)} contacts collected[/green]")
    return contacts
