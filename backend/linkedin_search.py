import os
import re
import httpx

GOOGLE_API_KEY = os.environ.get("GOOGLE_CSE_API_KEY", "")
GOOGLE_CSE_ID = os.environ.get("GOOGLE_CSE_ID", "")

SEARCH_URL = "https://www.googleapis.com/customsearch/v1"


def _parse_name_title_company(title: str) -> dict:
    cleaned = re.sub(r"\s*\|?\s*LinkedIn\s*$", "", title).strip()
    parts = cleaned.split(" - ")
    name = parts[0].strip() if parts else cleaned
    title_company = parts[1].strip() if len(parts) > 1 else ""

    job_title, company = "", ""
    for sep in [" at ", " @ "]:
        if sep in title_company:
            job_title, company = title_company.split(sep, 1)
            break
    else:
        job_title = title_company

    return {"name": name, "title": job_title.strip(), "company": company.strip()}


async def search_linkedin_profiles(query: str, max_results: int = 20) -> dict:
    if not GOOGLE_API_KEY or not GOOGLE_CSE_ID:
        return {"results": [], "error": "Missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_ID env vars"}

    full_query = f'site:linkedin.com/in {query}'
    results = []
    error = None

    async with httpx.AsyncClient(timeout=15) as client:
        start = 1
        while len(results) < max_results and start <= 91:
            params = {
                "key": GOOGLE_API_KEY,
                "cx": GOOGLE_CSE_ID,
                "q": full_query,
                "start": start,
                "num": min(10, max_results - len(results)),
            }
            try:
                resp = await client.get(SEARCH_URL, params=params)
                data = resp.json()
            except Exception as e:
                error = f"Request failed: {str(e)}"
                break

            if "error" in data:
                error = data["error"].get("message", "Unknown API error")
                break

            items = data.get("items", [])
            if not items:
                break

            for item in items:
                link = item.get("link", "")
                if "linkedin.com/in/" not in link:
                    continue
                parsed = _parse_name_title_company(item.get("title", ""))
                results.append({
                    "name": parsed["name"],
                    "title": parsed["title"],
                    "company": parsed["company"],
                    "location": "",
                    "url": link.split("?")[0],
                    "snippet": item.get("snippet", ""),
                })

            start += 10

    return {"results": results[:max_results], "error": error}