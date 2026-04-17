#!/usr/bin/env python3
"""
Lead Ops Scraper — multi-market agency + owner lead finder

Usage:
    python main.py                              # Dubai agencies (default)
    python main.py --market uk                  # UK agencies
    python main.py --market us                  # US agencies (Google Maps)
    python main.py --market us --lead-type owner              # US owners (Apify)
    python main.py --market us --lead-type owner --csv data.csv  # US owners from CSV
    python main.py --market all                 # Dubai + UK + US agencies
    python main.py --sites maps pf              # Legacy: multiple scrapers
"""

import argparse
import importlib
import os
import sys
from datetime import datetime

import pandas as pd
from rich.console import Console
from rich.table import Table

console = Console()

SITE_MAP = {
    "maps":  ("google_maps",    "scrapers.google_maps"),
    "pf":    ("propertyfinder", "scrapers.propertyfinder"),
    "bayut": ("bayut",          "scrapers.bayut"),
    "zoopla": ("zoopla",        "scrapers.zoopla"),
}

MARKETS = ["dubai", "uk", "us"]


def save_csv(contacts, name, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(output_dir, f"{name}_{ts}.csv")
    df = pd.DataFrame(contacts)
    if "phone" in df.columns:
        df = df.drop_duplicates(subset=["phone"], keep="first")
    df.to_csv(path, index=False, encoding="utf-8")
    return path


def save_combined(all_contacts, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(output_dir, f"all_contacts_{ts}.csv")
    df = pd.DataFrame(all_contacts)
    if "phone" in df.columns:
        df = df.drop_duplicates(subset=["phone"], keep="first")
    if "email" in df.columns:
        df["_has"] = df["email"].astype(bool)
        df = df.sort_values("_has", ascending=False).drop(columns=["_has"])
    df.to_csv(path, index=False, encoding="utf-8")
    return path


def print_summary(contacts):
    t = Table(title="Scrape Summary", show_lines=True)
    t.add_column("Market", style="cyan")
    t.add_column("Lead Type", style="blue")
    t.add_column("Total", justify="right", style="green")
    t.add_column("Phone", justify="right", style="yellow")
    t.add_column("Email", justify="right", style="magenta")

    groups = {}
    for c in contacts:
        key = (c.get("market", "?"), c.get("lead_type", "?"))
        if key not in groups:
            groups[key] = {"total": 0, "phone": 0, "email": 0}
        groups[key]["total"] += 1
        if c.get("phone"): groups[key]["phone"] += 1
        if c.get("email"): groups[key]["email"] += 1

    totals = {"total": 0, "phone": 0, "email": 0}
    for (market, lt), s in sorted(groups.items()):
        t.add_row(market, lt, str(s["total"]), str(s["phone"]), str(s["email"]))
        for k in totals: totals[k] += s[k]

    t.add_row("[bold]TOTAL[/bold]", "", f"[bold]{totals['total']}[/bold]",
              f"[bold]{totals['phone']}[/bold]", f"[bold]{totals['email']}[/bold]")
    console.print(t)


def main():
    parser = argparse.ArgumentParser(description="Lead Ops Scraper")
    parser.add_argument("--market", default="dubai",
                        choices=MARKETS + ["all"],
                        help="Target market: dubai | uk | us | all")
    parser.add_argument("--lead-type", default="agency",
                        choices=["agency", "owner"],
                        help="Lead type: agency | owner")
    parser.add_argument("--csv", default=None,
                        help="CSV path for owner CSV import (--lead-type owner)")
    parser.add_argument("--output", default="output",
                        help="Output directory (default: output)")
    # Legacy multi-site support
    parser.add_argument("--sites", nargs="+", choices=list(SITE_MAP.keys()),
                        help="Legacy: specific scrapers to run")
    args = parser.parse_args()

    console.print("[bold green]Lead Ops Scraper[/bold green] — starting\n")

    all_contacts = []

    # ── Legacy --sites mode ────────────────────────────────────────────────────
    if args.sites:
        for key in args.sites:
            site_name, module_path = SITE_MAP[key]
            console.rule(f"[bold]{site_name.upper()}[/bold]")
            try:
                mod = importlib.import_module(module_path)
                contacts = mod.run()
                if contacts:
                    path = save_csv(contacts, site_name, args.output)
                    console.print(f"  Saved → [cyan]{path}[/cyan]")
                    all_contacts.extend(contacts)
            except Exception as e:
                console.print(f"[red]{site_name} failed: {e}[/red]")
                import traceback; traceback.print_exc()

    # ── Market-based mode ──────────────────────────────────────────────────────
    else:
        markets = MARKETS if args.market == "all" else [args.market]

        for market in markets:
            console.rule(f"[bold]{market.upper()} — {args.lead_type}[/bold]")

            if args.lead_type == "agency":
                mod = importlib.import_module("scrapers.google_maps")
                contacts = mod.run(market=market)

            else:  # owner
                mod = importlib.import_module("scrapers.owner_sources")
                contacts = mod.run(csv_path=args.csv)

            if contacts:
                label = f"{market}_{args.lead_type}"
                path  = save_csv(contacts, label, args.output)
                console.print(f"  Saved → [cyan]{path}[/cyan]")
                all_contacts.extend(contacts)

    console.rule("[bold]DONE[/bold]")

    if all_contacts:
        combined = save_combined(all_contacts, args.output)
        console.print(f"\nCombined CSV → [bold cyan]{combined}[/bold cyan]")
        print_summary(all_contacts)
    else:
        console.print("[yellow]No contacts collected.[/yellow]")


if __name__ == "__main__":
    main()
