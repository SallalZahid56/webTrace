import os
import re
import httpx

SERPER_API_KEY = os.environ.get("SERPER_API_KEY", "")
SEARCH_URL = "https://google.serper.dev/search"


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



def _terms(text: str) -> list:
    return [t.strip().strip('"') for t in re.split(r"[,\n]", text or "") if t.strip()]


def build_query(query="", title="", niche="", location="", exclude="") -> str:
    parts = ["site:linkedin.com/in"]

    titles = _terms(title)
    if titles:
        parts.append("(" + " OR ".join(f'intitle:"{t}"' for t in titles) + ")")

    niches = _terms(niche)
    if niches:
        parts.append("(" + " OR ".join(f'"{n}"' for n in niches) + ")")

    locs = _terms(location)
    if locs:
        parts.append("(" + " OR ".join(f'"{l}"' for l in locs) + ")")

    if query.strip():
        parts.append(query.strip())

    for ex in _terms(exclude):
        parts.append(f'-"{ex}"')

    return " ".join(parts)


async def search_linkedin_profiles(query: str = "", max_results: int = 20,
                                   title: str = "", niche: str = "",
                                   location: str = "", exclude: str = "") -> dict:
    if not SERPER_API_KEY:
        return {"results": [], "error": "Missing SERPER_API_KEY env var", "query_used": ""}

    full_query = build_query(query, title, niche, location, exclude)
    results = []
    error = None

    headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        page = 1
        while len(results) < max_results and page <= 10:
            payload = {"q": full_query, "num": 10, "page": page}
            try:
                resp = await client.post(SEARCH_URL, headers=headers, json=payload)
                data = resp.json()
            except Exception as e:
                error = f"Request failed: {str(e)}"
                break

            if resp.status_code != 200:
                error = data.get("message", f"Serper error {resp.status_code}")
                break

            items = data.get("organic", [])
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

            page += 1

    return {"results": results[:max_results], "error": error, "query_used": full_query}