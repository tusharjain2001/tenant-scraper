"""Debug script — screenshots + HTML dumps to see what each site returns"""
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import os
import time

os.makedirs("output/debug", exist_ok=True)

PAGES = {
    "propertyfinder": "https://www.propertyfinder.ae/en/search?c=2&t=1&ob=nd&page=1",
    "bayut": "https://www.bayut.com/to-rent/property/dubai/",
    "zoopla": "https://www.zoopla.co.uk/to-rent/property/london/?page_size=25&pn=1",
}

with sync_playwright() as pw:
    browser = pw.chromium.launch(
        headless=False,
        args=["--disable-blink-features=AutomationControlled"],
    )
    ctx = browser.new_context(
        viewport={"width": 1400, "height": 900},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        locale="en-US",
    )
    page = ctx.new_page()
    Stealth().apply_stealth_sync(page)

    for name, url in PAGES.items():
        print(f"\n--- {name} ---")
        try:
            page.goto(url, timeout=40000, wait_until="domcontentloaded")
            time.sleep(6)  # wait for JS to render

            # Screenshot
            ss_path = f"output/debug/{name}.png"
            page.screenshot(path=ss_path, full_page=False)
            print(f"  Screenshot: {ss_path}")

            # HTML dump
            html = page.content()
            html_path = f"output/debug/{name}.html"
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"  HTML saved: {html_path} ({len(html)} bytes)")

            # Find any links that look like listings
            links = page.query_selector_all("a[href]")
            listing_links = []
            for link in links[:300]:
                href = link.get_attribute("href") or ""
                if any(kw in href for kw in ["/property/", "for-rent", "to-rent", "rental", "-for-rent", "listing"]):
                    listing_links.append(href)
            print(f"  Potential listing links: {len(listing_links)}")
            for l in listing_links[:8]:
                print(f"    {l}")

            # Print page title
            print(f"  Page title: {page.title()}")

            # Print all <a> hrefs containing useful keywords
            all_hrefs = [l.get_attribute("href") for l in links[:50] if l.get_attribute("href")]
            print(f"  First 10 hrefs on page:")
            for h in all_hrefs[:10]:
                print(f"    {h}")

        except Exception as e:
            print(f"  ERROR: {e}")

    ctx.close()
    browser.close()

print("\nDebug complete. Check output/debug/ folder.")
