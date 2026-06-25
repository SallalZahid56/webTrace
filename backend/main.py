from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from scraper import scrape_url
from maps_scraper import scrape_maps, is_valid_maps_url

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

# ── Maps models ───────────────────────────────────────────────────

class MapsRequest(BaseModel):
    url: str
    max_results: int = 20

class MapsBusinessResult(BaseModel):
    name:    str
    address: str
    phone:   str
    rating:  str
    reviews: str
    website: str

class MapsResponse(BaseModel):
    url:     str
    results: List[MapsBusinessResult]
    error:   Optional[str] = None

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

# ── Maps scrape endpoint ───────────────────────────────────────────

@app.post("/maps-scrape", response_model=MapsResponse)
async def maps_scrape(req: MapsRequest):

    # Validate URL before launching Playwright
    if not is_valid_maps_url(req.url):
        raise HTTPException(
            status_code=400,
            detail="Invalid Google Maps URL. Make sure it contains 'google.com/maps'.",
        )

    data = await scrape_maps(
        url=req.url,
        max_results=req.max_results,
    )

    return {
        "url":     req.url,
        "results": data.get("results", []),
        "error":   data.get("error"),
    }