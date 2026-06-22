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