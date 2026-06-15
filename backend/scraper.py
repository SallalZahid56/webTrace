import re
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# ── Constants ─────────────────────────────────────────────────────

REQUEST_TIMEOUT = 10  # seconds per page request

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Extra pages to check for contact info beyond the homepage
CONTACT_PATHS = ["/contact", "/about", "/contact-us", "/about-us"]

# Social media platforms to detect — pattern matches their domain in any href
SOCIAL_PATTERNS = {
    "linkedin":  r"linkedin\.com/(company|in)/[^\"'\s]+",
    "twitter":   r"(twitter\.com|x\.com)/[^\"'\s]+",
    "facebook":  r"facebook\.com/[^\"'\s]+",
    "instagram": r"instagram\.com/[^\"'\s]+",
    "youtube":   r"youtube\.com/(channel|c|@)[^\"'\s]+",
    "github":    r"github\.com/[^\"'\s]+",
    "tiktok":    r"tiktok\.com/@[^\"'\s]+",
}

# Email regex — standard format, avoids image filenames and common false positives
EMAIL_REGEX = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
)

# Phone regex — matches common formats like +1 (555) 123-4567, 555.123.4567, etc.
PHONE_REGEX = re.compile(
    r"(\+?\d{1,3}[\s\-.]?)?(\(?\d{2,4}\)?[\s\-.]?)(\d{3,4}[\s\-.]?\d{3,4})",
)

# Domains to skip when extracting emails (false positives)
EMAIL_SKIP_DOMAINS = {
    "example.com", "sentry.io", "wixpress.com", "amazonaws.com",
    "cloudflare.com", "googleapis.com", "gstatic.com", "w3.org",
    "schema.org", "openstreetmap.org",
}

# ── Main entry point ──────────────────────────────────────────────

async def scrape_url(
    url: str,
    check_contact_page: bool = True,
    deduplicate_emails: bool = True,
) -> dict:
    """
    Visit a URL (and optionally its /contact + /about pages),
    extract emails, phone numbers, and social media links.
    Returns a dict matching the ScrapeResponse model in main.py.
    """
    emails:  list[str] = []
    phones:  list[str] = []
    socials: list[dict] = []

    try:
        async with httpx.AsyncClient(
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
        ) as client:

            # Always scrape the homepage
            pages_to_scrape = [url]

            # Add contact/about pages if option is on
            if check_contact_page:
                base = get_base_url(url)
                for path in CONTACT_PATHS:
                    pages_to_scrape.append(urljoin(base, path))

            all_html = ""

            for page_url in pages_to_scrape:
                try:
                    resp = await client.get(page_url)
                    if resp.status_code == 200:
                        all_html += resp.text + "\n"
                except Exception:
                    # Sub-page failed (e.g. /contact doesn't exist) — skip it silently
                    continue

            if not all_html.strip():
                return build_response(url, [], [], [], error="No content returned")

            # Parse and extract
            soup = BeautifulSoup(all_html, "lxml")
            page_text = soup.get_text(separator=" ")

            emails  = extract_emails(page_text, deduplicate_emails)
            phones  = extract_phones(page_text)
            socials = extract_socials(all_html)

    except httpx.TimeoutException:
        return build_response(url, [], [], [], error="Request timed out")
    except httpx.RequestError as e:
        return build_response(url, [], [], [], error=f"Connection error: {str(e)}")
    except Exception as e:
        return build_response(url, [], [], [], error=f"Unexpected error: {str(e)}")

    return build_response(url, emails, phones, socials)


# ── Extractors ────────────────────────────────────────────────────

def extract_emails(text: str, deduplicate: bool) -> list[str]:
    found = EMAIL_REGEX.findall(text)
    cleaned = []
    for email in found:
        email = email.lower().strip()
        domain = email.split("@")[-1]
        # Skip known false-positive domains and image file extensions
        if domain in EMAIL_SKIP_DOMAINS:
            continue
        if any(email.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".svg"]):
            continue
        cleaned.append(email)

    if deduplicate:
        seen = set()
        unique = []
        for e in cleaned:
            if e not in seen:
                seen.add(e)
                unique.append(e)
        return unique

    return cleaned


def extract_phones(text: str) -> list[str]:
    matches = PHONE_REGEX.findall(text)
    phones = []
    seen = set()
    for groups in matches:
        number = "".join(groups).strip()
        # Filter out short matches (e.g. years, zip codes)
        digits_only = re.sub(r"\D", "", number)
        if len(digits_only) < 7 or len(digits_only) > 15:
            continue
        if number not in seen:
            seen.add(number)
            phones.append(number)
    return phones


def extract_socials(html: str) -> list[dict]:
    found = []
    seen_platforms = set()

    for platform, pattern in SOCIAL_PATTERNS.items():
        matches = re.findall(pattern, html, re.IGNORECASE)
        if matches:
            # Take the first clean match per platform
            raw = matches[0] if isinstance(matches[0], str) else matches[0][0]
            # Build full URL from the matched path
            if platform in ("twitter",):
                full_url = f"https://twitter.com/{raw.split('/')[-1]}"
            else:
                full_url = f"https://www.{platform}.com/{raw.split(f'{platform}.com/')[-1]}"

            if platform not in seen_platforms:
                seen_platforms.add(platform)
                found.append({"platform": platform, "url": full_url})

    return found


# ── Helpers ───────────────────────────────────────────────────────

def get_base_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def build_response(
    url: str,
    emails: list,
    phones: list,
    socials: list,
    error: str | None = None,
) -> dict:
    return {
        "url": url,
        "emails": emails,
        "phones": phones,
        "socials": socials,
        "error": error,
    }