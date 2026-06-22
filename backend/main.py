from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from scraper import scrape_url
from google_scraper import search_google

app = FastAPI(title="WebTrace API", version="2.0.0")

# ── CORS ──────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Request / Response models ─────────────────────────────────────

class ScrapeRequest(BaseModel):
    url: str
    check_contact_page: bool = True
    deduplicate_emails: bool = True

class SocialLink(BaseModel):
    platform: str
    url: str

class ScrapeResponse(BaseModel):
    url: str
    emails: List[str]
    phones: List[str]
    socials: List[SocialLink]
    error: Optional[str] = None

# ── NEW: Google Search models ──────────────────────────────────────

class GoogleSearchRequest(BaseModel):
    query: str
    num_results: int = 10

class BusinessResult(BaseModel):
    name: str
    website: str
    address: str
    rating: str
    reviews: str
    description: str

class GoogleSearchResponse(BaseModel):
    query: str
    results: List[BusinessResult]
    error: Optional[str] = None

# ── Routes ────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "WebTrace API v2 is running"}

@app.post("/scrape", response_model=ScrapeResponse)
async def scrape(req: ScrapeRequest):
    result = await scrape_url(
        url=req.url,
        check_contact_page=req.check_contact_page,
        deduplicate_emails=req.deduplicate_emails,
    )
    return result

# ── NEW: Google Search endpoint ────────────────────────────────────

@app.post("/google-search", response_model=GoogleSearchResponse)
async def google_search(req: GoogleSearchRequest):
    data = await search_google(
        query=req.query,
        num_results=req.num_results,
    )
    return {
        "query":   req.query,
        "results": data.get("results", []),
        "error":   data.get("error"),
    }


@app.post("/google-search-debug")
async def google_search_debug(req: GoogleSearchRequest):
    from google_scraper import fetch_ddg_html
    import httpx, random
    from google_scraper import USER_AGENTS

    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
    }

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.post(
            "https://html.duckduckgo.com/html/",
            headers=headers,
            data={"q": req.query, "kl": "us-en"},
        )

    html = resp.text
    return {
        "status_code": resp.status_code,
        "length": len(html),
        "preview": html[:2000],
        "has_captcha": "captcha" in html.lower(),
        "has_results": "result__a" in html or "result__snippet" in html,
    }