import re
import asyncio
import random
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urlencode, urlparse, parse_qs

# ── Constants ─────────────────────────────────────────────────────

REQUEST_TIMEOUT = 15  # seconds

# Rotate user-agents to reduce Google blocking
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

# Domains to skip when extracting business website URLs
SKIP_DOMAINS = {
    "google.com", "google.co", "googleadservices.com",
    "googleapis.com", "gstatic.com", "youtube.com",
    "facebook.com", "twitter.com", "instagram.com",
    "yelp.com", "tripadvisor.com", "bbb.org",
    "yellowpages.com", "mapquest.com", "bing.com",
}

# ── Main entry point ──────────────────────────────────────────────

async def search_google(
    query: str,
    num_results: int = 10,
) -> dict:
    """
    Search Google for the given query and extract business listings.
    Returns a dict with a list of business results and any error.

    Each result contains:
        - name        (str)  business name
        - website     (str)  business website URL or ""
        - address     (str)  address if found or ""
        - rating      (str)  rating string e.g. "4.5" or ""
        - reviews     (str)  review count e.g. "128" or ""
        - description (str)  snippet / description or ""
    """
    results = []
    error   = None

    try:
        html = await fetch_google_html(query, num_results)
        if not html:
            return {"results": [], "error": "Google returned no content — possibly blocked"}

        results = parse_google_results(html, num_results)

        if not results:
            # Fallback: try organic results only
            results = parse_organic_results(html, num_results)

    except httpx.TimeoutException:
        error = "Request to Google timed out"
    except httpx.RequestError as e:
        error = f"Connection error: {str(e)}"
    except Exception as e:
        error = f"Unexpected error: {str(e)}"

    return {"results": results, "error": error}


# ── HTTP fetch ────────────────────────────────────────────────────

async def fetch_google_html(query: str, num_results: int) -> str:
    """Fetch the Google search results page HTML."""
    params = {
        "q":    query,
        "num":  min(num_results + 5, 50),   # ask for a few extra to account for ads
        "hl":   "en",
        "gl":   "us",
        "pws":  "0",                        # disable personalised results
    }
    url = f"https://www.google.com/search?{urlencode(params)}"

    headers = {
        "User-Agent":      random.choice(USER_AGENTS),
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT":             "1",
        "Connection":      "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest":  "document",
        "Sec-Fetch-Mode":  "navigate",
        "Sec-Fetch-Site":  "none",
        "Cache-Control":   "max-age=0",
    }

    # Random delay between 1–3 seconds to be polite
    await asyncio.sleep(random.uniform(1.0, 3.0))

    async with httpx.AsyncClient(
        headers=headers,
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
    ) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            return ""
        return resp.text


# ── Parsers ───────────────────────────────────────────────────────

def parse_google_results(html: str, max_results: int) -> list[dict]:
    """
    Try to extract local business cards (the Knowledge Panel / Local Pack
    that Google shows for business searches).
    Falls back to organic results if no cards are found.
    """
    soup    = BeautifulSoup(html, "lxml")
    results = []

    # ── Strategy 1: Local business pack (3-pack map results) ──────
    # Google wraps these in <div class="VkpGBb"> or similar containers
    local_pack_selectors = [
        "div.VkpGBb",          # local 3-pack wrapper
        "div.cXedhc",          # alternate local pack
        "div[data-attrid]",    # structured business data
    ]

    local_cards = []
    for sel in local_pack_selectors:
        local_cards = soup.select(sel)
        if local_cards:
            break

    if local_cards:
        for card in local_cards[:max_results]:
            item = extract_from_local_card(card)
            if item and item.get("name"):
                results.append(item)

    # ── Strategy 2: Organic results with rich snippets ─────────────
    if not results:
        results = parse_organic_results(html, max_results)

    return results[:max_results]


def extract_from_local_card(card) -> dict:
    """Extract business info from a local business card element."""
    item = {"name": "", "website": "", "address": "", "rating": "", "reviews": "", "description": ""}

    # Business name — usually in a span or heading inside the card
    name_el = (
        card.select_one("span.OSrXXb")  or
        card.select_one("div.dbg0pd")   or
        card.select_one("span[role='heading']") or
        card.select_one("h3")
    )
    if name_el:
        item["name"] = name_el.get_text(strip=True)

    # Website link
    link_el = card.select_one("a[href]")
    if link_el:
        href = link_el.get("href", "")
        clean = clean_google_url(href)
        if clean and not is_skip_domain(clean):
            item["website"] = clean

    # Rating
    rating_el = card.select_one("span.yi40Hd") or card.select_one("span[aria-label*='stars']")
    if rating_el:
        item["rating"] = rating_el.get_text(strip=True)

    # Review count
    review_el = card.select_one("span.RDApEe") or card.select_one("span[aria-label*='reviews']")
    if review_el:
        text = review_el.get_text(strip=True)
        digits = re.sub(r"[^\d]", "", text)
        item["reviews"] = digits if digits else text

    # Address / description snippet
    desc_el = card.select_one("div.rllt__details") or card.select_one("span.LrzXr")
    if desc_el:
        text = desc_el.get_text(separator=" ", strip=True)
        if looks_like_address(text):
            item["address"] = text
        else:
            item["description"] = text

    return item


def parse_organic_results(html: str, max_results: int) -> list[dict]:
    """
    Parse standard organic Google search results.
    Extracts title, URL, and snippet for each result.
    """
    soup    = BeautifulSoup(html, "lxml")
    results = []

    # Google wraps each result in a <div class="g"> or <div class="MjjYud">
    result_blocks = soup.select("div.g") or soup.select("div.MjjYud") or soup.select("div.tF2Cxc")

    for block in result_blocks:
        if len(results) >= max_results:
            break

        item = {"name": "", "website": "", "address": "", "rating": "", "reviews": "", "description": ""}

        # Title (business name)
        title_el = block.select_one("h3")
        if not title_el:
            continue
        item["name"] = title_el.get_text(strip=True)

        # URL
        link_el = block.select_one("a[href]")
        if link_el:
            href  = link_el.get("href", "")
            clean = clean_google_url(href)
            if clean and not is_skip_domain(clean):
                item["website"] = clean

        # Skip results without a usable website
        if not item["website"]:
            continue

        # Description / snippet
        snippet_el = (
            block.select_one("div.VwiC3b") or
            block.select_one("span.st")    or
            block.select_one("div.s")
        )
        if snippet_el:
            item["description"] = snippet_el.get_text(separator=" ", strip=True)

        # Rating in snippet (e.g. "Rating: 4.5 · 200 reviews")
        rating_match = re.search(r"(\d\.\d)\s*[·•]\s*(\d[\d,]*)\s*review", item["description"], re.I)
        if rating_match:
            item["rating"]  = rating_match.group(1)
            item["reviews"] = rating_match.group(2).replace(",", "")

        results.append(item)

    return results


# ── Helpers ───────────────────────────────────────────────────────

def clean_google_url(href: str) -> str:
    """
    Google wraps URLs in /url?q=... redirects.
    Strip that wrapper and return the real destination URL.
    """
    if not href:
        return ""

    # Already a real URL
    if href.startswith("http") and "google.com" not in href:
        return href.split("&")[0]

    # /url?q=https://... redirect
    if "/url?q=" in href or "/url?" in href:
        parsed = urlparse(href)
        qs     = parse_qs(parsed.query)
        if "q" in qs:
            return qs["q"][0]

    return ""


def is_skip_domain(url: str) -> bool:
    """Return True if this URL belongs to a domain we should skip."""
    try:
        domain = urlparse(url).netloc.lower().replace("www.", "")
        return any(domain == skip or domain.endswith("." + skip) for skip in SKIP_DOMAINS)
    except Exception:
        return False


def looks_like_address(text: str) -> bool:
    """Heuristic: does this text look like a street address?"""
    address_patterns = [
        r"\d+\s+\w+\s+(st|ave|blvd|rd|dr|ln|way|ct|pl|hwy)\b",
        r"\b[A-Z][a-z]+,\s+[A-Z]{2}\s+\d{5}\b",   # City, ST 12345
        r"\b\d{5}(-\d{4})?\b",                      # ZIP code
    ]
    return any(re.search(p, text, re.I) for p in address_patterns)