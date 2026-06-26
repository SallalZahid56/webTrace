import re
import time
import threading
import asyncio
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

# ── Constants ─────────────────────────────────────────────────────
PAGE_TIMEOUT = 30_000
SCROLL_PAUSE = 2.0
MAX_SCROLLS  = 30

# ── Main entry point (async wrapper for FastAPI) ──────────────────

async def scrape_maps(url: str, max_results: int = 20) -> dict:
    result_container = {}

    def run_in_thread():
        try:
            result_container['data'] = _scrape_maps_sync(url, max_results)
        except Exception as e:
            result_container['data'] = {"results": [], "error": str(e)}

    thread = threading.Thread(target=run_in_thread)
    thread.start()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, thread.join)
    return result_container.get('data', {"results": [], "error": "Thread failed"})


# ── Sync Playwright scrape ────────────────────────────────────────

def _scrape_maps_sync(url: str, max_results: int) -> dict:
    results = []
    error   = None

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=False,
                args=["--no-sandbox", "--disable-setuid-sandbox",
                      "--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(
                viewport={"width": 1400, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="en-US",
            )
            page = context.new_page()
            page.goto(url, timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")

            # Dismiss consent dialogs
            for text in ["Accept all", "Reject all"]:
                try:
                    page.click(f'button:has-text("{text}")', timeout=3000)
                except Exception:
                    pass

            try:
                page.wait_for_selector('div[role="feed"]', timeout=PAGE_TIMEOUT)
            except Exception:
                browser.close()
                return {"results": [], "error": "Maps results panel did not load"}

            time.sleep(2)
            results = _scroll_and_extract(page, max_results)
            browser.close()

    except Exception as e:
        error = f"Unexpected error: {str(e)}"

    return {"results": results, "error": error}


# ── Scroll + extract ──────────────────────────────────────────────

def _scroll_and_extract(page, max_results: int) -> list:
    seen_names   = set()
    results      = []
    scrolls      = 0
    no_new_count = 0

    while scrolls < MAX_SCROLLS and len(results) < max_results:
        count_before = len(results)

        # Collect all card hrefs currently visible
        cards = page.query_selector_all('div[role="feed"] a[href*="/maps/place/"]')

        # Build a list of (name, href) first — don't click yet
        candidates = []
        for card in cards:
            name = (card.get_attribute("aria-label") or "").strip()
            href = card.get_attribute("href") or ""
            if name and name not in seen_names and href:
                candidates.append((name, href))

        # Now click into each new candidate one by one
        for name, href in candidates:
            if len(results) >= max_results:
                break
            if name in seen_names:
                continue

            listing = _extract_detail(page, name, href)
            if listing:
                seen_names.add(name)
                results.append(listing)

        # End of list check
        end_el = page.query_selector("span.HlvSq")
        if end_el:
            break

        # Scroll the feed
        try:
            feed = page.query_selector('div[role="feed"]')
            if feed:
                feed.evaluate("el => el.scrollBy(0, 1000)")
            else:
                page.evaluate("window.scrollBy(0, 1000)")
        except Exception:
            pass

        time.sleep(SCROLL_PAUSE)
        scrolls += 1

        if len(results) == count_before:
            no_new_count += 1
            if no_new_count >= 3:
                break
        else:
            no_new_count = 0

    return results


# ── Click into detail panel and extract everything ────────────────

def _extract_detail(page, name: str, href: str) -> dict | None:
    item = {
        "name":      name,
        "address":   "",
        "phone":     "",
        "rating":    "",
        "reviews":   "",
        "website":   "",
        "facebook":  "",
        "instagram": "",
        "linkedin":  "",
    }

    try:
        # Navigate directly to the place page
        page.goto(href, timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")
        time.sleep(2)

        # ── Rating ──
        try:
            rating_el = page.query_selector('div.F7nice span[aria-hidden="true"]')
            if rating_el:
                item["rating"] = rating_el.inner_text().strip()
        except Exception:
            pass

        # ── Reviews ──
        try:
            review_el = page.query_selector('div.F7nice span[aria-label*="review"]')
            if review_el:
                label = review_el.get_attribute("aria-label") or ""
                nums = re.findall(r'[\d,]+', label)
                if nums:
                    item["reviews"] = nums[0].replace(',', '')
        except Exception:
            pass

        # ── Address ──
        try:
            for sel in [
                'button[data-item-id*="address"]',
                'button[aria-label*="address" i]',
            ]:
                el = page.query_selector(sel)
                if el:
                    item["address"] = el.inner_text().strip()
                    break
        except Exception:
            pass

        # ── Phone ──
        try:
            for sel in [
                'button[data-item-id*="phone"]',
                'button[aria-label*="phone" i]',
            ]:
                el = page.query_selector(sel)
                if el:
                    text = el.inner_text().strip()
                    if re.search(r'\d{3}', text):
                        item["phone"] = text
                        break
        except Exception:
            pass

        # ── Website ──
        try:
            for sel in [
                'a[data-item-id*="authority"]',
                'a[aria-label*="website" i]',
            ]:
                el = page.query_selector(sel)
                if el:
                    href_val = el.get_attribute("href") or ""
                    if href_val.startswith("http") and "google" not in href_val:
                        item["website"] = href_val
                        break
        except Exception:
            pass

        # ── Social links — scan ALL links on the page ──
        try:
            all_links = page.query_selector_all('a[href]')
            for link in all_links:
                href_val = (link.get_attribute("href") or "").lower()
                if not href_val.startswith("http"):
                    continue
                if "facebook.com" in href_val and not item["facebook"]:
                    item["facebook"] = href_val
                elif "instagram.com" in href_val and not item["instagram"]:
                    item["instagram"] = href_val
                elif "linkedin.com" in href_val and not item["linkedin"]:
                    item["linkedin"] = href_val
        except Exception:
            pass

    except Exception:
        pass

    # Go back to the search results page
    try:
        page.go_back(timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")
        page.wait_for_selector('div[role="feed"]', timeout=10_000)
        time.sleep(1.5)
    except Exception:
        pass

    return item


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