from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from scraper import scrape_url

app = FastAPI(title="WebTrace API", version="1.0.0")

# ── CORS ──────────────────────────────────────────────────────────
# Allow all origins locally — tighten this to your Netlify domain when deploying
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
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
    error: str | None = None

# ── Routes ────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "WebTrace API is running"}

@app.post("/scrape", response_model=ScrapeResponse)
async def scrape(req: ScrapeRequest):
    result = await scrape_url(
        url=req.url,
        check_contact_page=req.check_contact_page,
        deduplicate_emails=req.deduplicate_emails,
    )
    return result