import asyncio
import re
from urllib.parse import urlparse
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

# ── Constants ─────────────────────────────────────────────────────

# How long to wait for Maps to load (ms)
PAGE_TIMEOUT    = 30_000
# How long to wait between scrolls (ms)
SCROLL_PAUSE    = 1_500
# Max scrolls before we give up looking for more results
MAX_SCROLLS     = 30

# ── Main entry point ──────────────────────────────────────────────

async def scrape_maps(url: str, max_results: int = 20) -> dict:
    """
    Accept a Google Maps search URL and return all visible business listings.
    Each listing has: name, address, phone, rating, reviews, website.
    """
    results = []
    error   = None

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--window-size=1280,800",
                ],
            )

            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="en-US",
            )

            page = await context.new_page()

            # Block images/fonts to speed up loading
            await page.route(
                "**/*",
                lambda route: route.abort()
                if route.request.resource_type in ("image", "font", "media")
                else route.continue_(),
            )

            # ── Navigate to Maps URL ──
            await page.goto(url, timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")

            # ── Wait for results panel ──
            try:
                await page.wait_for_selector(
                    'div[role="feed"], div.section-result, a[href*="/maps/place/"]',
                    timeout=PAGE_TIMEOUT,
                )
            except PWTimeout:
                await browser.close()
                return {"results": [], "error": "Maps results panel did not load — check the URL"}

            # ── Scroll to load all results ──
            results = await scroll_and_extract(page, max_results)

            await browser.close()

    except PWTimeout:
        error = "Page load timed out"
    except Exception as e:
        error = f"Unexpected error: {str(e)}"

    return {"results": results, "error": error}


# ── Scroll + extract ──────────────────────────────────────────────

async def scroll_and_extract(page, max_results: int) -> list:
    """
    Scroll through the Maps results feed and extract listings.
    Stops when max_results reached or no new results after scrolling.
    """
    seen_names = set()
    results    = []
    scrolls    = 0

    # The scrollable panel selector on Google Maps
    feed_selector = 'div[role="feed"]'

    while scrolls < MAX_SCROLLS and len(results) < max_results:
        # Extract currently visible listings
        cards = await page.query_selector_all(
            'div[role="feed"] > div, a[href*="/maps/place/"]'
        )

        for card in cards:
            if len(results) >= max_results:
                break
            listing = await extract_listing(card)
            if listing and listing["name"] and listing["name"] not in seen_names:
                seen_names.add(listing["name"])
                results.append(listing)

        # Check if end-of-list message appeared
        end_el = await page.query_selector("span.HlvSq")
        if end_el:
            break

        # Scroll the feed panel down
        try:
            feed = await page.query_selector(feed_selector)
            if feed:
                await feed.evaluate("el => el.scrollBy(0, 800)")
            else:
                await page.evaluate("window.scrollBy(0, 800)")
        except Exception:
            pass

        await asyncio.sleep(SCROLL_PAUSE / 1000)
        scrolls += 1

    return results


# ── Extract single listing ────────────────────────────────────────

async def extract_listing(card) -> dict | None:
    """
    Extract data from a single Maps result card element.
    """
    try:
        item = {
            "name":    "",
            "address": "",
            "phone":   "",
            "rating":  "",
            "reviews": "",
            "website": "",
        }

        # ── Name ──
        # Try aria-label on the card itself first
        name = await card.get_attribute("aria-label")
        if not name:
            # Try common name selectors
            for sel in [
                ".qBF1Pd",         # business name span
                ".fontHeadlineSmall",
                "h3",
                '[jsan*="t_kObpd"]',
            ]:
                el = await card.query_selector(sel)
                if el:
                    name = await el.inner_text()
                    break

        if not name or not name.strip():
            return None
        item["name"] = name.strip()

        # ── Rating ──
        for sel in [".MW4etd", 'span[aria-hidden="true"]']:
            el = await card.query_selector(sel)
            if el:
                text = await el.inner_text()
                if re.match(r"^\d\.\d$", text.strip()):
                    item["rating"] = text.strip()
                    break

        # ── Reviews ──
        for sel in [".UY7F9", 'span[aria-label*="review"]']:
            el = await card.query_selector(sel)
            if el:
                text = (await el.inner_text()).strip()
                # Strip parentheses → "(1,234)" → "1234"
                clean = re.sub(r"[(),\s]", "", text)
                if clean.isdigit():
                    item["reviews"] = clean
                    break

        # ── Address / phone from secondary text ──
        for sel in [".W4Efsd", ".Io6YTe", ".fontBodyMedium"]:
            els = await card.query_selector_all(sel)
            for el in els:
                text = (await el.inner_text()).strip()
                # Phone pattern
                if re.search(r"\(?\d{3}\)?[\s\-]\d{3}[\s\-]\d{4}", text):
                    item["phone"] = text
                # Address heuristic — contains digit + word or common keywords
                elif re.search(r"\d+\s+\w+|Ave|St|Rd|Blvd|Dr|Ln|Way|Pl", text, re.I):
                    if not item["address"]:
                        item["address"] = text

        # ── Website ──
        # Some cards have a direct website link
        for sel in ['a[data-value="Website"]', 'a[aria-label*="website" i]']:
            el = await card.query_selector(sel)
            if el:
                href = await el.get_attribute("href")
                if href and href.startswith("http"):
                    item["website"] = href
                    break

        return item

    except Exception:
        return None


# ── URL validator ─────────────────────────────────────────────────

def is_valid_maps_url(url: str) -> bool:
    """Check if URL looks like a Google Maps search/place URL."""
    try:
        parsed = urlparse(url)
        return (
            "google.com/maps" in parsed.netloc + parsed.path
            or "maps.google.com" in parsed.netloc
        )
    except Exception:
        return False