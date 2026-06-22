import re
import asyncio
import random
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urlencode, urlparse, quote_plus

# ── Constants ─────────────────────────────────────────────────────

REQUEST_TIMEOUT = 15

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

SKIP_DOMAINS = {
    "duckduckgo.com", "google.com", "googleadservices.com",
    "googleapis.com", "youtube.com", "facebook.com",
    "twitter.com", "instagram.com", "yelp.com",
    "tripadvisor.com", "bbb.org", "yellowpages.com",
    "mapquest.com", "bing.com", "linkedin.com",
    "pinterest.com", "reddit.com", "wikipedia.org",
}

# ── Main entry point ──────────────────────────────────────────────

async def search_google(
    query: str,
    num_results: int = 10,
) -> dict:
    """
    Search DuckDuckGo (HTML version) for the query.
    Returns a dict with results list and optional error string.
    """
    results = []
    error   = None

    try:
        html = await fetch_ddg_html(query)
        if not html:
            return {"results": [], "error": "No content returned — possibly blocked"}

        results = parse_ddg_results(html, num_results)

        if not results:
            return {"results": [], "error": "No results found for this query"}

    except httpx.TimeoutException:
        error = "Request timed out"
    except httpx.RequestError as e:
        error = f"Connection error: {str(e)}"
    except Exception as e:
        error = f"Unexpected error: {str(e)}"

    return {"results": results, "error": error}


# ── HTTP fetch ────────────────────────────────────────────────────

async def fetch_ddg_html(query: str) -> str:
    """Fetch DuckDuckGo HTML results page."""

    headers = {
        "User-Agent":      random.choice(USER_AGENTS),
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "DNT":             "1",
        "Connection":      "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }

    await asyncio.sleep(random.uniform(1.0, 2.5))

    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
    ) as client:
        resp = await client.post(
            "https://html.duckduckgo.com/html/",
            headers=headers,
            data={"q": query, "kl": "us-en"},
        )
        if resp.status_code != 200:
            return ""
        return resp.text


# ── Parser ────────────────────────────────────────────────────────

def parse_ddg_results(html: str, max_results: int) -> list[dict]:
    """
    Parse DuckDuckGo HTML results.
    Each result block is a <div class="result"> containing title, URL, snippet.
    """
    soup    = BeautifulSoup(html, "lxml")
    results = []

    # DDG wraps each result in <div class="result results_links results_links_deep web-result">
    blocks = soup.select("div.result")

    for block in blocks:
        if len(results) >= max_results:
            break

        # Skip ad blocks
        if "result--ad" in block.get("class", []):
            continue

        item = {
            "name":        "",
            "website":     "",
            "address":     "",
            "rating":      "",
            "reviews":     "",
            "description": "",
        }

        # Title / business name
        title_el = block.select_one("a.result__a") or block.select_one("h2 a")
        if not title_el:
            continue
        item["name"] = title_el.get_text(strip=True)

        # URL — DDG puts the real URL in data-href or href
        href = title_el.get("href", "")
        clean = clean_ddg_url(href)
        if not clean or is_skip_domain(clean):
            continue
        item["website"] = clean

        # Snippet / description
        snippet_el = (
            block.select_one("a.result__snippet") or
            block.select_one("div.result__snippet")
        )
        if snippet_el:
            item["description"] = snippet_el.get_text(separator=" ", strip=True)

        # Try to pull a rating from the snippet if present
        rating_match = re.search(
            r"(\d\.\d)\s*(?:out of \d|stars?|[·•])\s*(?:\(?([\d,]+)\s*reviews?\)?)?",
            item["description"], re.I
        )
        if rating_match:
            item["rating"]  = rating_match.group(1)
            item["reviews"] = (rating_match.group(2) or "").replace(",", "")

        results.append(item)

    return results


# ── Helpers ───────────────────────────────────────────────────────

def clean_ddg_url(href: str) -> str:
    """DDG result links are direct URLs (no redirect wrapper like Google)."""
    if not href:
        return ""
    if href.startswith("http"):
        return href.split("?")[0] if "utm_" in href else href
    return ""


def is_skip_domain(url: str) -> bool:
    try:
        domain = urlparse(url).netloc.lower().replace("www.", "")
        return any(domain == skip or domain.endswith("." + skip) for skip in SKIP_DOMAINS)
    except Exception:
        return False