"""
Owner Lead Scraper — powered by Apify
Runs pre-built actors for each market to get direct landlord/owner contacts.

Markets & actors:
  US  → Craigslist housing (vaclavrut/craigslist-scraper)   — email + phone
  US  → Zillow FRBO       (maxcopell/zillow-scraper)         — phone + address
  Dubai → Dubizzle         (epctex/dubizzle-scraper)          — phone + address
  UK  → Gumtree           (epctex/gumtree-scraper)           — email + phone

Fallback: CSV import of county/tax-assessor records
"""

import os
import re
import sys
import csv
import json
import time
import requests
from rich.console import Console

console = Console(highlight=False)

APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
APIFY_BASE  = "https://api.apify.com/v2"

# ── Actors per market ─────────────────────────────────────────────────────────
ACTORS = {
    "us_craigslist": "ivanvs/craigslist-scraper",
    "us_zillow":     "maxcopell/zillow-scraper",
    "dubai":         "epctex/dubizzle-scraper",
    "uk":            "epctex/gumtree-scraper",
}

US_CITIES = [
    "New York", "Miami", "Dallas", "Houston", "Austin",
    "Orlando",  "Tampa", "Phoenix", "Los Angeles", "Chicago",
]

DUBAI_AREAS = [
    "Dubai Marina", "Downtown Dubai", "JBR", "Business Bay",
    "Jumeirah", "Palm Jumeirah", "Deira", "Bur Dubai",
]

UK_CITIES = ["London", "Manchester", "Birmingham", "Leeds", "Bristol"]

# ── Apify helpers ─────────────────────────────────────────────────────────────

def _run_actor(actor_id: str, input_payload: dict, max_wait_s: int = 300) -> list[dict]:
    """Start an Apify actor run, wait for it to finish, return dataset items."""
    if not APIFY_TOKEN:
        console.print("[red]APIFY_TOKEN not set — cannot run actor[/red]")
        return []

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {APIFY_TOKEN}"

    # Start run
    resp = session.post(
        f"{APIFY_BASE}/acts/{actor_id}/runs",
        json={"input": input_payload},
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        console.print(f"[red]Apify start error {resp.status_code}: {resp.text[:200]}[/red]")
        return []

    run_id  = resp.json()["data"]["id"]
    dataset = resp.json()["data"].get("defaultDatasetId", "")
    console.print(f"  [dim]Actor run started: {run_id}[/dim]")

    # Poll until finished
    deadline = time.time() + max_wait_s
    while time.time() < deadline:
        time.sleep(8)
        status_resp = session.get(f"{APIFY_BASE}/actor-runs/{run_id}", timeout=15)
        status = status_resp.json()["data"]["status"]
        console.print(f"  [dim]Status: {status}[/dim]")
        if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            break

    if status != "SUCCEEDED":
        console.print(f"  [red]Actor {run_id} ended with: {status}[/red]")
        return []

    # Fetch dataset
    items_resp = session.get(
        f"{APIFY_BASE}/datasets/{dataset}/items",
        params={"format": "json", "clean": "true"},
        timeout=60,
    )
    return items_resp.json() if items_resp.ok else []


def _clean_phone(phone: str) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return phone.strip()


def _clean_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not e or "@" not in e or "." not in e:
        return ""
    skip = ["noreply", "example", "test@", "sentry", "placeholder"]
    if any(s in e for s in skip):
        return ""
    return e


# ── US: Craigslist ─────────────────────────────────────────────────────────────
def _scrape_us_craigslist(cities: list[str], max_per_city: int = 100) -> list[dict]:
    console.print("\n[bold cyan]Craigslist — US owner rentals[/bold cyan]")
    contacts = []

    for city in cities:
        console.print(f"  City: [yellow]{city}[/yellow]")
        # Craigslist city slug (lowercase, no spaces)
        slug = city.lower().replace(" ", "")
        input_payload = {
            "startUrls": [
                {"url": f"https://{slug}.craigslist.org/search/apa?by_owner=1&availabilityMode=0"}
            ],
            "maxItems": max_per_city,
            "extendOutputFunction": "($) => { return {}; }",
        }

        items = _run_actor(ACTORS["us_craigslist"], input_payload, max_wait_s=180)
        console.print(f"  → {len(items)} listings")

        for item in items:
            email = _clean_email(
                item.get("email") or item.get("replyEmail") or ""
            )
            phone = _clean_phone(
                item.get("phone") or item.get("phoneNumber") or ""
            )
            if not email and not phone:
                continue

            title   = item.get("title") or item.get("name") or ""
            address = item.get("address") or item.get("location") or city

            contacts.append({
                "source":           "apify_craigslist",
                "market":           "us",
                "lead_type":        "owner",
                "owner_name":       "",
                "agency_name":      title[:80] if title else f"Owner in {city}",
                "email":            email,
                "phone":            phone,
                "phone_e164":       phone if phone.startswith("+") else "",
                "city":             city,
                "property_address": address,
                "listing_url":      item.get("url") or "",
            })

    console.print(f"[green]Craigslist total: {len(contacts)} owner contacts[/green]")
    return contacts


# ── US: Zillow FRBO ───────────────────────────────────────────────────────────
def _scrape_us_zillow(cities: list[str], max_per_city: int = 50) -> list[dict]:
    console.print("\n[bold cyan]Zillow FRBO — US owner rentals[/bold cyan]")
    contacts = []

    for city in cities:
        console.print(f"  City: [yellow]{city}[/yellow]")
        city_slug = city.lower().replace(" ", "-")
        input_payload = {
            "startUrls": [
                {"url": f"https://www.zillow.com/homes/for_rent/{city_slug}_rb/?isForRentByOwner=true"}
            ],
            "maxItems": max_per_city,
            "type": "FOR_RENT",
        }

        items = _run_actor(ACTORS["us_zillow"], input_payload, max_wait_s=240)
        console.print(f"  → {len(items)} listings")

        for item in items:
            phone = _clean_phone(
                item.get("phone") or item.get("agentPhone") or
                item.get("contactPhone") or ""
            )
            email = _clean_email(
                item.get("email") or item.get("agentEmail") or ""
            )
            if not phone and not email:
                continue

            address = (
                item.get("address") or
                item.get("streetAddress") or
                f"{city}"
            )
            owner = item.get("agentName") or item.get("brokerName") or ""

            contacts.append({
                "source":           "apify_zillow",
                "market":           "us",
                "lead_type":        "owner",
                "owner_name":       owner,
                "agency_name":      owner or f"Owner — {address[:60]}",
                "email":            email,
                "phone":            phone,
                "phone_e164":       phone if phone.startswith("+") else "",
                "city":             city,
                "property_address": address,
                "listing_url":      item.get("url") or item.get("hdpUrl") or "",
            })

    console.print(f"[green]Zillow FRBO total: {len(contacts)} owner contacts[/green]")
    return contacts


# ── Dubai: Dubizzle ───────────────────────────────────────────────────────────
def _scrape_dubai(areas: list[str], max_results: int = 200) -> list[dict]:
    console.print("\n[bold cyan]Dubizzle — Dubai owner rentals[/bold cyan]")

    input_payload = {
        "startUrls": [
            {"url": "https://uae.dubizzle.com/property-for-rent/residential/"}
        ],
        "maxItems": max_results,
        "category": "property-for-rent",
    }

    items = _run_actor(ACTORS["dubai"], input_payload, max_wait_s=300)
    console.print(f"  → {len(items)} listings")

    contacts = []
    for item in items:
        phone = _clean_phone(item.get("phone") or item.get("phoneNumber") or "")
        email = _clean_email(item.get("email") or "")
        if not phone and not email:
            continue

        owner = item.get("posterName") or item.get("name") or ""
        address = item.get("location") or item.get("address") or "Dubai"

        contacts.append({
            "source":           "apify_dubizzle",
            "market":           "dubai",
            "lead_type":        "owner",
            "owner_name":       owner,
            "agency_name":      owner or "Dubai Owner",
            "email":            email,
            "phone":            phone,
            "phone_e164":       phone,
            "city":             "Dubai",
            "property_address": address,
            "listing_url":      item.get("url") or "",
        })

    console.print(f"[green]Dubizzle total: {len(contacts)} owner contacts[/green]")
    return contacts


# ── UK: Gumtree ───────────────────────────────────────────────────────────────
def _scrape_uk(cities: list[str], max_per_city: int = 100) -> list[dict]:
    console.print("\n[bold cyan]Gumtree — UK private landlords[/bold cyan]")
    contacts = []

    for city in cities:
        console.print(f"  City: [yellow]{city}[/yellow]")
        city_slug = city.lower().replace(" ", "-")
        input_payload = {
            "startUrls": [
                {"url": f"https://www.gumtree.com/property-to-rent/{city_slug}?private=true"}
            ],
            "maxItems": max_per_city,
        }

        items = _run_actor(ACTORS["uk"], input_payload, max_wait_s=180)
        console.print(f"  → {len(items)} listings")

        for item in items:
            phone = _clean_phone(item.get("phone") or item.get("phoneNumber") or "")
            email = _clean_email(item.get("email") or "")
            if not phone and not email:
                continue

            contacts.append({
                "source":           "apify_gumtree",
                "market":           "uk",
                "lead_type":        "owner",
                "owner_name":       item.get("sellerName") or "",
                "agency_name":      item.get("title") or f"Owner in {city}",
                "email":            email,
                "phone":            phone,
                "phone_e164":       "",
                "city":             city,
                "property_address": item.get("location") or city,
                "listing_url":      item.get("url") or "",
            })

    console.print(f"[green]Gumtree total: {len(contacts)} owner contacts[/green]")
    return contacts


# ── CSV import fallback ───────────────────────────────────────────────────────
OWNER_CSV_COLUMNS = {
    "owner_name":       ["owner", "owner_name", "taxpayer", "taxpayer_name"],
    "email":            ["email", "email_address", "owner_email"],
    "phone_raw":        ["phone", "phone_number", "owner_phone", "contact_phone"],
    "property_address": ["address", "property_address", "situs_address", "site_address"],
    "city":             ["city", "situs_city", "property_city"],
}

def _find_col(headers, candidates):
    for c in candidates:
        for h in headers:
            if h.strip().lower() == c.lower():
                return h
    return None

def run_csv_import(csv_path: str) -> list[dict]:
    if not csv_path or not os.path.exists(csv_path):
        console.print(f"[red]CSV not found: {csv_path}[/red]")
        return []

    console.print(f"[bold cyan]CSV owner import: {csv_path}[/bold cyan]")
    contacts = []

    with open(csv_path, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader  = csv.DictReader(f)
        headers = reader.fieldnames or []
        col_map = {field: _find_col(headers, cands) for field, cands in OWNER_CSV_COLUMNS.items()}
        console.print(f"  Columns mapped: {col_map}")

        for row in reader:
            email   = _clean_email(row.get(col_map.get("email") or "", ""))
            phone   = _clean_phone(row.get(col_map.get("phone_raw") or "", ""))
            address = row.get(col_map.get("property_address") or "", "").strip()
            city    = row.get(col_map.get("city") or "", "").strip()
            owner   = row.get(col_map.get("owner_name") or "", "").strip()

            if not email and not phone:
                continue

            contacts.append({
                "source":           "csv_import",
                "market":           "us",
                "lead_type":        "owner",
                "owner_name":       owner,
                "agency_name":      owner,
                "email":            email,
                "phone":            phone,
                "phone_e164":       phone if phone.startswith("+") else "",
                "city":             city,
                "property_address": address,
                "listing_url":      "",
            })

    console.print(f"[green]CSV import: {len(contacts)} owner records[/green]")
    return contacts


# ── Main entry point ──────────────────────────────────────────────────────────
def run(market: str = "us", csv_path: str = None,
        cities: list = None, max_per_city: int = 100) -> list[dict]:
    """
    market:       'us' | 'dubai' | 'uk'
    csv_path:     optional CSV for manual import (US only)
    cities:       override default city list
    max_per_city: max listings per city/area
    """
    if not APIFY_TOKEN and not csv_path:
        console.print("[yellow]No APIFY_TOKEN and no --csv path. Nothing to scrape.[/yellow]")
        return []

    contacts = []

    if csv_path:
        contacts.extend(run_csv_import(csv_path))

    if APIFY_TOKEN:
        if market == "us":
            target_cities = cities or US_CITIES
            contacts.extend(_scrape_us_craigslist(target_cities, max_per_city))
            contacts.extend(_scrape_us_zillow(target_cities, max_per_city // 2))
        elif market == "dubai":
            contacts.extend(_scrape_dubai(cities or DUBAI_AREAS, max_per_city * 2))
        elif market == "uk":
            contacts.extend(_scrape_uk(cities or UK_CITIES, max_per_city))

    # Deduplicate on phone + email
    seen = set()
    unique = []
    for c in contacts:
        key = (c.get("email") or "", c.get("phone") or "")
        if key == ("", ""):
            continue
        if key not in seen:
            seen.add(key)
            unique.append(c)

    console.print(f"\n[bold green]Owner leads total: {len(unique)} unique contacts[/bold green]")
    return unique
