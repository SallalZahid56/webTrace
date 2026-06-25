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
                headless=False,   # visible so Google doesn't block us
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                ],
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

            # Navigate
            page.goto(url, timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")

            # Dismiss cookie/consent dialog if it appears
            try:
                page.click('button:has-text("Accept all")', timeout=4000)
            except Exception:
                pass
            try:
                page.click('button:has-text("Reject all")', timeout=2000)
            except Exception:
                pass

            # Wait for results feed
            try:
                page.wait_for_selector('div[role="feed"]', timeout=PAGE_TIMEOUT)
            except Exception:
                browser.close()
                return {"results": [], "error": "Maps results panel did not load — check the URL"}

            # Extra wait for content to settle
            time.sleep(2)

            results = _scroll_and_extract(page, max_results)
            browser.close()

    except Exception as e:
        error = f"Unexpected error: {str(e)}"

    return {"results": results, "error": error}


# ── Scroll + extract ──────────────────────────────────────────────

def _scroll_and_extract(page, max_results: int) -> list:
    seen_names = set()
    results    = []
    scrolls    = 0
    no_new_count = 0  # stop if we keep getting no new results

    while scrolls < MAX_SCROLLS and len(results) < max_results:
        count_before = len(results)

        # Each result card is an <a> tag linking to a Maps place
        cards = page.query_selector_all('div[role="feed"] a[href*="/maps/place/"]')

        for card in cards:
            if len(results) >= max_results:
                break
            listing = _extract_listing(card, page)
            if listing and listing["name"] and listing["name"] not in seen_names:
                seen_names.add(listing["name"])
                results.append(listing)

        # Check end-of-list
        end_markers = [
            "span.HlvSq",
            "p.fontBodyMedium span",
        ]
        for marker in end_markers:
            end_el = page.query_selector(marker)
            if end_el and "end of" in (end_el.inner_text() or "").lower():
                return results

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

        # If no new results found after scrolling, count strikes
        if len(results) == count_before:
            no_new_count += 1
            if no_new_count >= 3:
                break
        else:
            no_new_count = 0

    return results


# ── Extract single listing ────────────────────────────────────────

def _extract_listing(card, page) -> dict | None:
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
        # aria-label on the <a> card is the most reliable source
        name = card.get_attribute("aria-label")
        if name:
            item["name"] = name.strip()
        else:
            return None

        # ── Get the full text content of the card for parsing ──
        card_text = card.inner_text()
        lines = [l.strip() for l in card_text.split('\n') if l.strip()]

        # ── Rating ──
        for line in lines:
            # Matches "4.5" or "4.5(123)"
            m = re.match(r'^(\d\.\d)', line)
            if m:
                item["rating"] = m.group(1)
                # Try to get review count from same line e.g. "4.5(1,234)"
                rev = re.search(r'\(([0-9,]+)\)', line)
                if rev:
                    item["reviews"] = rev.group(1).replace(',', '')
                break

        # ── Reviews (fallback — look for standalone count) ──
        if not item["reviews"]:
            for line in lines:
                m = re.search(r'\(([0-9,]+)\)', line)
                if m:
                    item["reviews"] = m.group(1).replace(',', '')
                    break

        # ── Address ──
        # Look for lines that look like addresses
        for line in lines:
            if re.search(r'\d+\s+\w+', line) and re.search(
                r'\b(St|Ave|Rd|Blvd|Dr|Ln|Way|Pl|Fwy|Hwy|Pkwy|Ct|Cir|Blvd|Suite|Ste|#)\b',
                line, re.I
            ):
                item["address"] = line
                break

        # ── Phone ──
        for line in lines:
            if re.search(r'\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}', line):
                item["phone"] = line.strip()
                break

        # ── Website ──
        # Try clicking the listing to open its detail panel
        # and grab the website link from there
        try:
            card.click()
            time.sleep(1.5)

            # Website button in the detail panel
            website_selectors = [
                'a[data-item-id*="authority"]',
                'a[aria-label*="website" i]',
                'a[data-tooltip*="website" i]',
                'a[href*="http"]:not([href*="google"])',
            ]
            for sel in website_selectors:
                el = page.query_selector(sel)
                if el:
                    href = el.get_attribute("href")
                    if href and href.startswith("http") and "google" not in href:
                        item["website"] = href
                        break

            # Also try to get phone from detail panel (more reliable)
            phone_selectors = [
                'button[data-item-id*="phone"] .fontBodyMedium',
                'button[aria-label*="phone" i]',
                '[data-tooltip*="phone" i]',
            ]
            for sel in phone_selectors:
                el = page.query_selector(sel)
                if el:
                    phone_text = el.inner_text().strip()
                    if phone_text:
                        item["phone"] = phone_text
                        break

            # Also grab address from detail panel
            address_selectors = [
                'button[data-item-id*="address"] .fontBodyMedium',
                'button[aria-label*="address" i]',
            ]
            for sel in address_selectors:
                el = page.query_selector(sel)
                if el:
                    addr_text = el.inner_text().strip()
                    if addr_text:
                        item["address"] = addr_text
                        break

            # Go back to results list
            page.go_back(timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")
            time.sleep(1.5)

            # Re-wait for feed
            page.wait_for_selector('div[role="feed"]', timeout=10_000)

        except Exception:
            # If click/back fails, just return what we have
            try:
                page.go_back(timeout=5000, wait_until="domcontentloaded")
                time.sleep(1)
            except Exception:
                pass

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