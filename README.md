# WebTrace

WebTrace is a lightweight web-scraping project that helps you collect contact details such as emails, phone numbers, and social links from websites. It includes a FastAPI backend plus a browser-based frontend for scraping one URL, many URLs, or a CSV file.

## What the project does

- Scrapes a target website for contact-related data
- Supports batch scanning from pasted URLs or uploaded CSV files
- Includes a Google-style search tab in the UI for a search-and-scrape workflow
- Exports results as CSV for easy downstream use

## Project structure

- backend/
  - main.py — FastAPI app and routes
  - scraper.py — website scraping logic
  - google_scraper.py — search-result helper (currently uses DuckDuckGo HTML results)
  - requirements.txt — Python dependencies
- frontend/
  - index.html — app layout
  - app.js — frontend logic and API calls
  - style.css — styling

## Requirements

- Python 3.10+ recommended
- pip
- A modern browser

## Quick start (Windows)

1. Create and activate a virtual environment

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

3. Run the backend

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

4. Serve the frontend

```powershell
cd ..\frontend
python -m http.server 3000
```

Then open http://localhost:3000 in your browser.

## API

Base URL:

```text
http://127.0.0.1:8000
```

### GET /

Health check endpoint.

### POST /scrape

Scrapes a single URL and returns contact data.

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

### Search flow

The frontend includes a Google Search tab. The search helper in backend/google_scraper.py is currently built around DuckDuckGo's HTML results page, so the flow is a search-and-scrape experience rather than a direct Google API integration.

## Frontend usage

- Paste URLs one per line in the URL tab
- Upload a CSV file in the CSV tab and choose the URL column
- Use the Google Search tab to enter a query and start a search-driven scrape
- Results appear in the table and can be exported as CSV

## Troubleshooting

### Pylance import errors

If VS Code shows errors such as "Import fastapi could not be resolved", make sure you:

- Select the correct Python interpreter for the project
- Activate the virtual environment and install requirements again

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Backend not reachable from the frontend

If the UI reports that it cannot reach the backend, confirm that the FastAPI server is running on port 8000.

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Notes

- The scraper is intentionally simple and may miss some sites depending on their HTML structure.
- Respect site terms of service and robots rules when scraping.
- CORS is currently permissive for local development; tighten it before production use.

## License

MIT
