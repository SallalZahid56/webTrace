import asyncio
import re
import threading
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

# ── Constants ─────────────────────────────────────────────────────
PAGE_TIMEOUT = 30_000
SCROLL_PAUSE = 1.5
MAX_SCROLLS  = 30

# ── Main entry point ──────────────────────────────────────────────

async def scrape_maps(url: str, max_results: int = 20) -> dict:
    """
    Run the Playwright scrape in a background thread with its own
    event loop — avoids the Windows ProactorEventLoop conflict with uvicorn.
    """
    result_container = {}

    def run_in_thread():
        try:
            result_container['data'] = _scrape_maps_sync(url, max_results)
        except Exception as e:
            result_container['data'] = {"results": [], "error": str(e)}

    thread = threading.Thread(target=run_in_thread)
    thread.start()

    # Wait for the thread without blocking the async event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, thread.join)

    return result_container.get('data', {"results": [], "error": "Thread failed"})


# ── Sync Playwright scrape (runs inside its own thread) ───────────

def _scrape_maps_sync(url: str, max_results: int) -> dict:
    results = []
    error   = None

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--window-size=1280,800",
                ],
            )

            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="en-US",
            )

            page = context.new_page()

            # Block images/fonts to speed up loading
            page.route(
                "**/*",
                lambda route: route.abort()
                if route.request.resource_type in ("image", "font", "media")
                else route.continue_(),
            )

            # Navigate to Maps URL
            page.goto(url, timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")

            # Wait for results panel
            try:
                page.wait_for_selector(
                    'div[role="feed"], div.section-result, a[href*="/maps/place/"]',
                    timeout=PAGE_TIMEOUT,
                )
            except Exception:
                browser.close()
                return {"results": [], "error": "Maps results panel did not load — check the URL"}

            # Scroll and extract
            results = _scroll_and_extract(page, max_results)
            browser.close()

    except Exception as e:
        error = f"Unexpected error: {str(e)}"

    return {"results": results, "error": error}


# ── Scroll + extract (sync) ───────────────────────────────────────

def _scroll_and_extract(page, max_results: int) -> list:
    seen_names = set()
    results    = []
    scrolls    = 0
    feed_selector = 'div[role="feed"]'

    while scrolls < MAX_SCROLLS and len(results) < max_results:
        cards = page.query_selector_all(
            'div[role="feed"] > div, a[href*="/maps/place/"]'
        )

        for card in cards:
            if len(results) >= max_results:
                break
            listing = _extract_listing(card)
            if listing and listing["name"] and listing["name"] not in seen_names:
                seen_names.add(listing["name"])
                results.append(listing)

        # Check for end-of-list marker
        end_el = page.query_selector("span.HlvSq")
        if end_el:
            break

        # Scroll the feed panel down
        try:
            feed = page.query_selector(feed_selector)
            if feed:
                feed.evaluate("el => el.scrollBy(0, 800)")
            else:
                page.evaluate("window.scrollBy(0, 800)")
        except Exception:
            pass

        import time
        time.sleep(SCROLL_PAUSE)
        scrolls += 1

    return results


# ── Extract single listing (sync) ─────────────────────────────────

def _extract_listing(card) -> dict | None:
    try:
        item = {
            "name":    "",
            "address": "",
            "phone":   "",
            "rating":  "",
            "reviews": "",
            "website": "",
        }

        # Name
        name = card.get_attribute("aria-label")
        if not name:
            for sel in [".qBF1Pd", ".fontHeadlineSmall", "h3", '[jsan*="t_kObpd"]']:
                el = card.query_selector(sel)
                if el:
                    name = el.inner_text()
                    break

        if not name or not name.strip():
            return None
        item["name"] = name.strip()

        # Rating
        for sel in [".MW4etd", 'span[aria-hidden="true"]']:
            el = card.query_selector(sel)
            if el:
                text = el.inner_text()
                if re.match(r"^\d\.\d$", text.strip()):
                    item["rating"] = text.strip()
                    break

        # Reviews
        for sel in [".UY7F9", 'span[aria-label*="review"]']:
            el = card.query_selector(sel)
            if el:
                text = el.inner_text().strip()
                clean = re.sub(r"[(),\s]", "", text)
                if clean.isdigit():
                    item["reviews"] = clean
                    break

        # Address / phone
        for sel in [".W4Efsd", ".Io6YTe", ".fontBodyMedium"]:
            els = card.query_selector_all(sel)
            for el in els:
                text = el.inner_text().strip()
                if re.search(r"\(?\d{3}\)?[\s\-]\d{3}[\s\-]\d{4}", text):
                    item["phone"] = text
                elif re.search(r"\d+\s+\w+|Ave|St|Rd|Blvd|Dr|Ln|Way|Pl", text, re.I):
                    if not item["address"]:
                        item["address"] = text

        # Website
        for sel in ['a[data-value="Website"]', 'a[aria-label*="website" i]']:
            el = card.query_selector(sel)
            if el:
                href = el.get_attribute("href")
                if href and href.startswith("http"):
                    item["website"] = href
                    break

        return item

    except Exception:
        return None


# ── URL validator ─────────────────────────────────────────────────

def is_valid_maps_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return (
            "google.com/maps" in parsed.netloc + parsed.path
            or "maps.google.com" in parsed.netloc
        )
    except Exception:
        return False