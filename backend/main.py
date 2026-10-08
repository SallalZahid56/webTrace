import asyncio
import sys
import json

from dotenv import load_dotenv
load_dotenv()

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from scraper import scrape_url
from fastapi.responses import StreamingResponse
from maps_scraper import scrape_maps, scrape_maps_stream, is_valid_maps_url
from linkedin_search import search_linkedin_profiles

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
    whatsapp: List[str] = []
    facebook: str = ""
    instagram: str = ""
    linkedin: str = ""
    twitter: str = ""
    youtube: str = ""
    github: str = ""
    tiktok: str = ""
    error: Optional[str] = None

# ── Maps models ───────────────────────────────────────────────────

class MapsRequest(BaseModel):
    url: str
    max_results: int = 20
    skip_list: List[str] = []

class MapsBusinessResult(BaseModel):
    name:      str
    address:   str
    phone:     str
    rating:    str
    reviews:   str
    website:   str
    facebook:  str = ""
    instagram: str = ""
    linkedin:  str = ""

class MapsResponse(BaseModel):
    url:     str
    results: List[MapsBusinessResult]
    error:   Optional[str] = None


class LinkedInSearchRequest(BaseModel):
    query: str
    max_results: int = 20

class LinkedInProfileResult(BaseModel):
    name: str
    title: str = ""
    company: str = ""
    location: str = ""
    url: str
    snippet: str = ""

class LinkedInSearchResponse(BaseModel):
    query: str
    results: List[LinkedInProfileResult]
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



@app.post("/maps-scrape-stream")
async def maps_scrape_stream(req: MapsRequest):
    if not is_valid_maps_url(req.url):
        raise HTTPException(
            status_code=400,
            detail="Invalid Google Maps URL. Make sure it contains 'google.com/maps'.",
        )

    async def event_generator():
        async for item in scrape_maps_stream(req.url, req.max_results, req.skip_list):
            yield json.dumps(item) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

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



@app.post("/linkedin-search", response_model=LinkedInSearchResponse)
async def linkedin_search(req: LinkedInSearchRequest):
    data = await search_linkedin_profiles(req.query, req.max_results)
    return {
        "query": req.query,
        "results": data.get("results", []),
        "error": data.get("error"),
    }