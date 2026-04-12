# ============================================================
# REQUIRED: Get a free Google Maps API key at:
# https://console.cloud.google.com/
# Enable "Places API" in your project (free $200/month credit)
# ============================================================
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# ============================================================
# Search queries — edit to target specific markets / niches
# ============================================================
GOOGLE_MAPS_SEARCHES = [
    # Dubai
    "property management company Dubai",
    "real estate letting agency Dubai",
    "residential property rental agency Dubai",
    "property leasing company Dubai Marina",
    "property leasing company Downtown Dubai",
    "property leasing company JBR Dubai",
    "property leasing company Business Bay Dubai",
    "property leasing company Jumeirah Dubai",

    # UK — London
    "letting agent London",
    "property management company London",
    "residential letting agency West London",
    "residential letting agency East London",
    "residential letting agency North London",
    "residential letting agency South London",
    "estate agent rental London",

    # US — New York
    "property management company New York",
    "residential property manager New York",
    "apartment leasing company Manhattan",
    "property management Brooklyn New York",
]

# How many pages per query (Google Maps returns 20 results/page, max 3 pages = 60)
GOOGLE_MAPS_MAX_PAGES = 3

# Legacy site-scraper config (kept for reference, sites are fully bot-protected)
PROPERTY_FINDER_CONFIG = {
    "base_url": "https://www.propertyfinder.ae",
    "search_url": "https://www.propertyfinder.ae/en/search?c=2&t=1&ob=nd&page={page}",
    "max_pages": 20,
}

BAYUT_CONFIG = {
    "base_url": "https://www.bayut.com",
    "search_url": "https://www.bayut.com/to-rent/property/dubai/?page={page}",
    "max_pages": 20,
}

ZOOPLA_CONFIG = {
    "base_url": "https://www.zoopla.co.uk",
    "search_url": "https://www.zoopla.co.uk/to-rent/property/london/?page_size=25&pn={page}",
    "max_pages": 20,
}

OUTPUT_DIR = "output"
