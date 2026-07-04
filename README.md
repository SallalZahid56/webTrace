# WebTrace

WebTrace is a web-scraping project that collects contact details — emails, phone numbers, and social links — from websites. It has a FastAPI backend and a browser-based frontend, and supports three scraping modes: pasted URLs, an uploaded CSV of URLs, and a Google Maps business search.

## What the project does

- Scrapes a target website (and optionally its `/contact` and `/about` pages) for emails, phone numbers, and social profile links
- Supports batch scanning from pasted URLs or an uploaded CSV file with auto-detected URL columns
- Scrapes a Google Maps search-results page (via Playwright) to collect business listings — name, address, phone, rating, website — then visits each business's website to extract emails, phones, and socials
- Shows live scan progress in an activity feed and results table
- Exports results as CSV, with a column layout tailored to whichever mode was used (URL / CSV / Maps)

## Project structure

```
main.py            — FastAPI app and routes
scraper.py          — website scraping logic (emails, phones, socials)
maps_scraper.py      — Google Maps scraping logic (Playwright)
index.html           — app layout
app.js               — frontend logic and API calls
```

> Note: adjust the paths above if you keep backend and frontend files in separate folders — the commands below assume everything runs from a single working directory.

## Requirements

- Python 3.10+ recommended
- pip
- A modern browser
- Playwright (with Chromium installed) for the Google Maps scraping mode

## Quick start (Windows)

1. Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies

```powershell
pip install --upgrade pip
pip install fastapi uvicorn httpx beautifulsoup4 lxml playwright pydantic
playwright install chromium
```

3. Run the backend

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

4. Serve the frontend

Open `index.html` directly in a browser, or serve it so relative paths resolve cleanly:

```powershell
python -m http.server 3000
```

Then open http://localhost:3000 in your browser.

> The frontend's `API_BASE` in `app.js` is currently hardcoded to `http://localhost:8000`. Update it if your backend runs elsewhere.

## API

Base URL:

```text
http://127.0.0.1:8000
```

### GET /

Health check endpoint.

### POST /scrape

Scrapes a single URL and returns contact data. Used by both the "Paste URLs" and "Upload CSV" modes, and internally by the Maps flow once a business website is found.

Request body:

```json
{
  "url": "https://example.com",
  "check_contact_page": true,
  "deduplicate_emails": true
}
```

Response:

```json
{
  "url": "https://example.com",
  "emails": ["info@example.com"],
  "phones": ["+1-555-555-5555"],
  "socials": [{"platform": "twitter", "url": "https://twitter.com/example"}],
  "error": null
}
```

### POST /maps-scrape

Scrapes a Google Maps search-results URL and returns business listings.

Request body:

```json
{
  "url": "https://www.google.com/maps/search/plumbers+in+houston",
  "max_results": 20
}
```

Response:

```json
{
  "url": "https://www.google.com/maps/search/plumbers+in+houston",
  "results": [
    {
      "name": "Acme Plumbing",
      "address": "123 Main St, Houston, TX",
      "phone": "+1 555-555-5555",
      "rating": "4.5",
      "reviews": "128",
      "website": "https://acmeplumbing.com",
      "facebook": "",
      "instagram": "",
      "linkedin": ""
    }
  ],
  "error": null
}
```

The frontend then calls `/scrape` on each listing's `website` to fill in emails, phones, and any additional socials found on the business's own site.

## Frontend usage

- **Paste URLs** tab — paste one URL per line, then start the scan
- **Upload CSV** tab — drop or browse a CSV file; the URL column is auto-detected (columns named like `url`, `website`, `domain`, `link`, or `site` are pre-selected) but can be changed manually
- **Maps** tab — paste a Google Maps search-results URL (must contain `google.com/maps` or `maps.google.com`), choose how many results to pull (10 / 20 / 30 / 50 / All), then start the scan
- Results stream into the activity feed and table in real time and can be stopped mid-scan; partial results remain downloadable
- Click **Download CSV** to export — column layout adapts automatically to the active mode

## Troubleshooting

### Pylance import errors

If your editor shows errors such as "Import fastapi could not be resolved", make sure you:

- Select the correct Python interpreter for the project
- Activate the virtual environment and reinstall dependencies

```powershell
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn httpx beautifulsoup4 lxml playwright pydantic
```

### Backend not reachable from the frontend

If the UI reports it can't reach the backend, confirm the FastAPI server is running on port 8000:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Also check that `API_BASE` in `app.js` matches the backend's actual host/port.

### Maps scraping fails or times out

- Make sure Playwright's Chromium browser is installed: `playwright install chromium`
- Google Maps' DOM structure changes periodically — if selectors stop matching, the scraper may return partial or empty results
- Large `max_results` values take longer, since each listing is opened individually to read its detail panel

## Notes

- The website scraper is intentionally simple and may miss contact info on sites with unusual HTML structure or JavaScript-rendered content
- The Maps scraper depends on Google's current page markup and may need selector updates over time
- Respect site terms of service and robots rules when scraping
- CORS is currently permissive (`allow_origins=["*"]`) for local development; tighten it before any production use

## License

MIT