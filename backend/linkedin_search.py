import os
import re
import httpx
import json
from urllib.parse import urlparse, parse_qs

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


def build_query(query="", title="", niche="", location="", exclude="", kind="person") -> str:
    path = "company" if kind == "company" else "in"
    parts = [f"site:linkedin.com/{path}"]

    titles = _terms(title) if kind != "company" else []
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



# Add IDs you run into. Only IDs listed here get translated to words.
GEO_NAMES = {
    "103644278": "United States",
}
INDUSTRY_NAMES = {
    # "4": "Software",   <- example: add the ID and the word(s) you want searched
}
NOISE_PARAMS = {"origin", "sid", "page"}


def parse_linkedin_url(url: str) -> dict:
    out = {"kind": "person", "query": "", "title": "", "niche": "", "location": "", "ignored": []}

    if "/sales/" in url:
        out["ignored"].append("Sales Navigator URL (not supported, fill the fields manually)")
        return out

    if "/search/results/companies" in url:
        out["kind"] = "company"

    qs = parse_qs(urlparse(url).query)

    def first(key):
        return (qs.get(key, [""])[0] or "").strip().strip('"')

    def id_list(key):
        raw = (qs.get(key, [""])[0] or "").strip()
        if not raw:
            return []
        try:
            val = json.loads(raw)
            return [str(v) for v in val] if isinstance(val, list) else [str(val)]
        except Exception:
            return [raw.strip('"')]

    keywords = first("keywords")
    if keywords.strip(" ."):
        out["query"] = keywords
    company = first("company")
    if company:
        out["query"] = f'{out["query"]} "{company}"'.strip()

    out["title"] = first("title")

    geo_key = "companyHqGeo" if out["kind"] == "company" else "geoUrn"
    for key, table, field in ((geo_key, GEO_NAMES, "location"),
                              ("industry", INDUSTRY_NAMES, "niche")):
        known, unknown = [], []
        for item in id_list(key):
            (known if item in table else unknown).append(table.get(item, item))
        out[field] = ", ".join(known)
        if unknown:
            out["ignored"].append(f"{key} IDs not in lookup table: {', '.join(unknown)}")

    handled = {"keywords", "title", "company", geo_key, "industry"}
    for key in qs:
        if key not in handled and key not in NOISE_PARAMS:
            out["ignored"].append(key)

    return out



def _parse_company_name(title: str) -> str:
    name = re.sub(r"\s*[|\-–]\s*LinkedIn\s*$", "", title).strip()
    name = re.sub(r"\s*[:\-–]\s*Overview\s*$", "", name, flags=re.I).strip()
    return name


async def search_linkedin_profiles(query: str = "", max_results: int = 20,
                                   title: str = "", niche: str = "",
                                   location: str = "", exclude: str = "",
                                   linkedin_url: str = "", kind: str = "person") -> dict:
    if not SERPER_API_KEY:
        return {"results": [], "error": "Missing SERPER_API_KEY env var",
                "query_used": "", "ignored_filters": [], "kind": kind}

    ignored = []
    if linkedin_url.strip():
        parsed_url = parse_linkedin_url(linkedin_url)
        ignored = parsed_url["ignored"]
        kind = parsed_url["kind"]
        query = query or parsed_url["query"]
        title = title or parsed_url["title"]
        niche = niche or parsed_url["niche"]
        location = location or parsed_url["location"]

    full_query = build_query(query, title, niche, location, exclude, kind)
    results = []
    seen = set()
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

                if kind == "company":
                    m = re.match(r"(https?://[^/]+/company/[^/?#]+)", link)
                    if not m:
                        continue
                    clean_url = m.group(1)
                    if clean_url in seen:
                        continue
                    seen.add(clean_url)
                    results.append({
                        "name": _parse_company_name(item.get("title", "")),
                        "title": "",
                        "company": "",
                        "location": "",
                        "url": clean_url,
                        "snippet": item.get("snippet", ""),
                    })
                else:
                    if "linkedin.com/in/" not in link:
                        continue
                    clean_url = link.split("?")[0]
                    if clean_url in seen:
                        continue
                    seen.add(clean_url)
                    parsed = _parse_name_title_company(item.get("title", ""))
                    results.append({
                        "name": parsed["name"],
                        "title": parsed["title"],
                        "company": parsed["company"],
                        "location": "",
                        "url": clean_url,
                        "snippet": item.get("snippet", ""),
                    })

            page += 1

    return {"results": results[:max_results], "error": error,
            "query_used": full_query, "ignored_filters": ignored, "kind": kind}