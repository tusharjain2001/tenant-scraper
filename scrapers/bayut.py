"""
Bayut (Dubai) — GraphQL API scraper
Bayut exposes a public GraphQL endpoint used by their own frontend.
No browser needed — pure requests.
"""
import time
import random
import requests
from rich.console import Console
from config import BAYUT_CONFIG

console = Console()

GRAPHQL_URL = "https://www.bayut.com/graphql/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Referer": "https://www.bayut.com/to-rent/property/dubai/",
    "Origin": "https://www.bayut.com",
    "X-Forwarded-For": "185.220.101.1",
}

LISTING_QUERY = """
query GetListings($filters: [FilterInput!], $page: Int, $pageSize: Int, $sort: [SortInput!], $lang: String) {
  listings(filters: $filters, page: $page, pageSize: $pageSize, sort: $sort, lang: $lang) {
    total
    listings {
      id
      title
      externalID
      slug
      purpose
      referenceNumber
      location {
        name
        slug
      }
      contactInformation {
        agents {
          name
          email
          phones {
            number
            isdCode
          }
        }
        brokersInfo {
          name
          logo { url }
          phone
          email
        }
      }
    }
  }
}
"""


def _build_payload(page: int) -> dict:
    return {
        "operationName": "GetListings",
        "variables": {
            "filters": [
                {"attribute": "purpose", "values": ["for-rent"]},
                {"attribute": "category", "values": ["residential"]},
                {"attribute": "locationSlug", "values": ["dubai"]},
            ],
            "page": page,
            "pageSize": 25,
            "sort": [{"attribute": "date", "order": "DESC"}],
            "lang": "en",
        },
        "query": LISTING_QUERY,
    }


def _extract_contacts(listing: dict) -> dict:
    contact = {
        "source": "bayut",
        "listing_url": f"https://www.bayut.com/property/details-{listing.get('externalID', '')}.html",
        "agent_name": "",
        "agency_name": "",
        "phone": "",
        "email": "",
        "listing_title": listing.get("title", ""),
        "property_type": listing.get("category", {}).get("nameSingular", "") if isinstance(listing.get("category"), dict) else "",
        "location": "",
    }

    # Location
    locations = listing.get("location", [])
    if isinstance(locations, list) and locations:
        contact["location"] = locations[-1].get("name", "")
    elif isinstance(locations, dict):
        contact["location"] = locations.get("name", "")

    # Contact info
    ci = listing.get("contactInformation", {}) or {}

    # Agent
    agents = ci.get("agents", []) or []
    if agents:
        agent = agents[0]
        contact["agent_name"] = agent.get("name", "")
        contact["email"] = agent.get("email", "") or ""
        phones = agent.get("phones", []) or []
        if phones:
            ph = phones[0]
            isd = ph.get("isdCode", "")
            num = ph.get("number", "")
            contact["phone"] = f"+{isd}{num}" if isd else num

    # Broker/agency
    brokers = ci.get("brokersInfo", []) or []
    if brokers:
        broker = brokers[0]
        contact["agency_name"] = broker.get("name", "")
        if not contact["phone"]:
            contact["phone"] = broker.get("phone", "") or ""
        if not contact["email"]:
            contact["email"] = broker.get("email", "") or ""

    return contact


def run() -> list[dict]:
    contacts = []
    cfg = BAYUT_CONFIG

    console.print("[bold cyan]Bayut API scraper starting...[/bold cyan]")

    session = requests.Session()
    session.headers.update(HEADERS)

    for page_num in range(0, cfg["max_pages"]):
        console.print(f"  Page {page_num + 1}/{cfg['max_pages']}...")
        try:
            payload = _build_payload(page_num)
            resp = session.post(GRAPHQL_URL, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            listings_data = (
                data.get("data", {})
                .get("listings", {})
                .get("listings", [])
            )

            if not listings_data:
                console.print(f"  [yellow]No listings on page {page_num + 1}, stopping.[/yellow]")
                break

            console.print(f"  Got {len(listings_data)} listings")

            for listing in listings_data:
                contact = _extract_contacts(listing)
                if contact["agent_name"] or contact["phone"] or contact["agency_name"]:
                    contacts.append(contact)

            time.sleep(random.uniform(1.0, 2.5))

        except requests.HTTPError as e:
            console.print(f"  [red]HTTP error on page {page_num + 1}: {e}[/red]")
            if e.response.status_code in (429, 403):
                console.print("  [yellow]Rate limited — waiting 30s...[/yellow]")
                time.sleep(30)
        except Exception as e:
            console.print(f"  [red]Error on page {page_num + 1}: {e}[/red]")

    console.print(f"[green]Bayut: {len(contacts)} contacts collected[/green]")
    return contacts
