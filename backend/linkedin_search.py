import os
import re
import httpx

BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY", "")
SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


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
    if not BRAVE_API_KEY:
        return {"results": [], "error": "Missing BRAVE_API_KEY env var"}

    full_query = f'site:linkedin.com/in {query}'
    results = []
    error = None

    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        offset = 0
        while len(results) < max_results and offset < 9:
            params = {
                "q": full_query,
                "count": min(20, max_results - len(results)),
                "offset": offset,
            }
            try:
                resp = await client.get(SEARCH_URL, headers=headers, params=params)
                data = resp.json()
            except Exception as e:
                error = f"Request failed: {str(e)}"
                break

            if "error" in data:
                error = str(data["error"])
                break

            items = data.get("web", {}).get("results", [])
            if not items:
                break

            for item in items:
                link = item.get("url", "")
                if "linkedin.com/in/" not in link:
                    continue
                parsed = _parse_name_title_company(item.get("title", ""))
                results.append({
                    "name": parsed["name"],
                    "title": parsed["title"],
                    "company": parsed["company"],
                    "location": "",
                    "url": link.split("?")[0],
                    "snippet": item.get("description", ""),
                })

            offset += 1

    return {"results": results[:max_results], "error": error}