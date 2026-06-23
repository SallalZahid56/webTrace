# WebTrace

WebTrace is a small web-scraping + API project that extracts emails, phone numbers, and social links from a target website. It provides a FastAPI backend and a minimal frontend in the `frontend/` folder.

## Repo structure

- `backend/` — FastAPI backend
  - `main.py` — API routes
  - `scraper.py` — scraping logic (exports `scrape_url`)
  - `requirements.txt` — Python dependencies
- `frontend/` — static frontend
  - `index.html`, `app.js`, `style.css`

## Requirements

- Python 3.11+ recommended
- `pip` available

The backend dependencies are listed in `backend/requirements.txt`.

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

3. Run the backend (development)

```powershell
# from backend/
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

4. Serve the frontend (open `frontend/index.html` or run a simple server)

```powershell
# from frontend/
python -m http.server 3000
# then open http://localhost:3000 in your browser
```

Or use the VS Code Live Server extension to serve `frontend/`.

## API

Base URL (development): `http://127.0.0.1:8000`

- `GET /` — health/status
- `POST /scrape` — run a scrape
- `POST /search` — search (DuckDuckGo) + scrape results (see Google/DuckDuckGo flow)

Request JSON for `/scrape`:

```json
{
  "url": "https://example.com",
  "check_contact_page": true,
  "deduplicate_emails": true
}
```

Response model (`ScrapeResponse`):

```json
{
  "url": "https://example.com",
  "emails": ["info@example.com"],
  "phones": ["+1-555-555-5555"],
  "socials": [{"platform":"twitter","url":"https://twitter.com/example"}],
  "error": null
}
```

Example curl call:

```bash
curl -X POST "http://127.0.0.1:8000/scrape" -H "Content-Type: application/json" -d '{"url":"https://example.com"}'

### Search + scrape (Google-style flow)

The project includes a search flow (implemented using `backend/google_scraper.py`) that performs an HTML search query against DuckDuckGo, then scrapes each returned website for contact data using the same scraping logic in `scraper.py`.

Endpoint: `POST /search`

Request JSON:

```json
{
  "query": "Plumbers in Houston TX",
  "num_results": 10,
  "check_contact_page": true,
  "deduplicate_emails": true
}
```

Response (summary):

```json
{
  "results": [
    {
      "name": "Example Business",
      "website": "https://example.com",
      "description": "...",
      "emails": ["info@example.com"],
      "phones": ["+1-555-555-5555"],
      "socials": [{"platform":"twitter","url":"https://twitter.com/example"}],
      "error": null
    }
  ],
  "error": null
}
```

Notes:
- The current `google_scraper.py` fetches HTML results from DuckDuckGo's lightweight HTML endpoint and parses result blocks; the filename contains "google" for historical reasons.
- Be mindful of rate limits and blocking when running many queries; the scraper adds small delays and rotates user agents, but abusing search endpoints may trigger CAPTCHAs or blocks.
- Respect robots.txt and the target sites' terms of service when scraping.
```

## Troubleshooting: Pylance "Import could not be resolved"

If VS Code's Pylance reports errors like `Import "fastapi" could not be resolved`:

- Ensure you have activated the workspace Python interpreter that points to the virtual environment where you installed dependencies.
  - Open the Command Palette → `Python: Select Interpreter` → choose the `.venv` you created in `backend/`.
- Install the requirements into that environment:

```powershell
# from backend/ with the venv active
pip install -r requirements.txt
```

- Restart the Python language server or reload the VS Code window if Pylance still shows missing imports.

## Notes

- `backend/main.py` expects `scraper.py` to export an `async def scrape_url(...)` coroutine. Adjust invocation if you change the scraper signature.
- CORS is permissive for local development (`allow_origins: ["*"]`). Lock this down for production.

## Contributing

PRs welcome. Please open issues for bugs or feature requests.

## License

MIT
