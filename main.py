#!/usr/bin/env python3
"""
Tenant Scraper — Property Management Agency Contact Finder
Pulls agency name, phone, email, website into CSV files in ./output/

Primary method: Google Maps Places API (most reliable, no CAPTCHA)
  → Searches for real estate/letting agencies by city
  → Returns phone + email per agency

Usage:
    python main.py                  # Run Google Maps scraper (recommended)
    python main.py --sites maps     # Same as above
    python main.py --sites pf       # Property Finder (may be blocked)
    python main.py --sites bayut    # Bayut (may be blocked)
    python main.py --sites zoopla   # Zoopla (may be blocked)
    python main.py --sites maps pf  # Multiple

Setup (Google Maps):
    1. Go to https://console.cloud.google.com/
    2. Create a project → Enable "Places API"
    3. Create an API key → paste it in config.py as GOOGLE_MAPS_API_KEY
    Free tier: $200/month credit (~28,000 searches — more than enough)
"""

import argparse
import os
import sys
from datetime import datetime

import pandas as pd
from rich.console import Console
from rich.table import Table

console = Console()

SITE_MAP = {
    "maps": ("google_maps", "scrapers.google_maps"),
    "pf": ("propertyfinder", "scrapers.propertyfinder"),
    "bayut": ("bayut", "scrapers.bayut"),
    "zoopla": ("zoopla", "scrapers.zoopla"),
}


def save_csv(contacts: list[dict], site_name: str, output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = os.path.join(output_dir, f"{site_name}_{timestamp}.csv")
    df = pd.DataFrame(contacts)
    if "phone" in df.columns:
        df = df.drop_duplicates(subset=["phone"], keep="first")
    df.to_csv(filename, index=False)
    return filename


def save_combined_csv(all_contacts: list[dict], output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = os.path.join(output_dir, f"all_contacts_{timestamp}.csv")
    df = pd.DataFrame(all_contacts)
    if "phone" in df.columns:
        df = df.drop_duplicates(subset=["phone"], keep="first")
    # Sort: contacts with email first
    if "email" in df.columns:
        df["_has_email"] = df["email"].astype(bool)
        df = df.sort_values("_has_email", ascending=False).drop(columns=["_has_email"])
    df.to_csv(filename, index=False)
    return filename


def print_summary(all_contacts: list[dict]):
    table = Table(title="Scraping Summary", show_lines=True)
    table.add_column("Source", style="cyan")
    table.add_column("Contacts", style="green", justify="right")
    table.add_column("With Phone", style="yellow", justify="right")
    table.add_column("With Email", style="magenta", justify="right")

    sources = {}
    for c in all_contacts:
        src = c.get("source", "unknown")
        if src not in sources:
            sources[src] = {"total": 0, "phone": 0, "email": 0}
        sources[src]["total"] += 1
        if c.get("phone"):
            sources[src]["phone"] += 1
        if c.get("email"):
            sources[src]["email"] += 1

    total_contacts = total_phone = total_email = 0
    for src, stats in sources.items():
        table.add_row(src, str(stats["total"]), str(stats["phone"]), str(stats["email"]))
        total_contacts += stats["total"]
        total_phone += stats["phone"]
        total_email += stats["email"]

    table.add_row(
        "[bold]TOTAL[/bold]",
        f"[bold]{total_contacts}[/bold]",
        f"[bold]{total_phone}[/bold]",
        f"[bold]{total_email}[/bold]",
    )
    console.print(table)


def main():
    parser = argparse.ArgumentParser(description="Property agency contact scraper")
    parser.add_argument(
        "--sites",
        nargs="+",
        choices=list(SITE_MAP.keys()),
        default=["maps"],
        help="Which scrapers to run (default: maps)",
    )
    parser.add_argument("--output", default="output", help="Output directory (default: output)")
    args = parser.parse_args()

    console.print("[bold green]Tenant Scraper[/bold green] — starting up\n")
    console.print(f"Sites: [cyan]{', '.join(args.sites)}[/cyan]")
    console.print(f"Output: [cyan]{args.output}/[/cyan]\n")

    all_contacts = []

    for key in args.sites:
        site_name, module_path = SITE_MAP[key]
        console.rule(f"[bold]{site_name.upper()}[/bold]")
        try:
            import importlib
            mod = importlib.import_module(module_path)
            contacts = mod.run()
            if contacts:
                path = save_csv(contacts, site_name, args.output)
                console.print(f"  Saved to [cyan]{path}[/cyan]")
                all_contacts.extend(contacts)
        except Exception as e:
            console.print(f"[red]Failed to run {site_name} scraper: {e}[/red]")
            import traceback
            traceback.print_exc()

    console.rule("[bold]DONE[/bold]")

    if all_contacts:
        combined_path = save_combined_csv(all_contacts, args.output)
        console.print(f"\nCombined CSV: [bold cyan]{combined_path}[/bold cyan]")
        print_summary(all_contacts)
    else:
        console.print("[yellow]No contacts collected.[/yellow]")


if __name__ == "__main__":
    main()
