// ── Config ─────────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:8000';

// ── State ──────────────────────────────────────────────────────────
const state = {
  activeTab: 'urls',
  csvData: null,
  csvHeaders: [],
  results: [],
  isRunning: false,
  stopRequested: false,
  activeController: null,
};

function switchTab(tab) {
  state.activeTab = tab;

  // Toggle tab buttons
  document.getElementById('tab-urls').classList.toggle('active', tab === 'urls');
  document.getElementById('tab-csv').classList.toggle('active', tab === 'csv');
  document.getElementById('tab-maps').classList.toggle('active', tab === 'maps');
  document.getElementById('tab-linkedin').classList.toggle('active', tab === 'linkedin');

  // Toggle panels
  document.getElementById('panel-urls').style.display = tab === 'urls' ? 'block' : 'none';
  document.getElementById('panel-csv').style.display = tab === 'csv' ? 'block' : 'none';
  document.getElementById('panel-maps').style.display = tab === 'maps' ? 'block' : 'none';
  document.getElementById('panel-linkedin').style.display = tab === 'linkedin' ? 'block' : 'none';

  // Hide options section in Google and Maps mode
  const showOptions = tab === 'urls' || tab === 'csv';
  document.getElementById('options-section').style.display = showOptions ? 'block' : 'none';

  // Update run button label per tab
  const runBtn = document.getElementById('run-btn');
  if (tab === 'maps') {
    runBtn.innerHTML = `
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>
      Scrape Maps`;
  } else if (tab === 'linkedin') {
    runBtn.innerHTML = `
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 7.5h-9v9h9v-9Z"/></svg>
      Search LinkedIn`;
  } else {
    runBtn.innerHTML = `
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Start scraping`;
  }
}

// ── URL input ──────────────────────────────────────────────────────
document.getElementById('url-input').addEventListener('input', function () {
  const urls = parseUrlText(this.value);
  document.getElementById('url-count').textContent =
    urls.length === 0 ? '0 URLs entered' : `${urls.length} URL${urls.length > 1 ? 's' : ''} entered`;
});
function clearUrls() {
  document.getElementById('url-input').value = '';
  document.getElementById('url-count').textContent = '0 URLs entered';
}
function parseUrlText(text) {
  return text.split('\n').map(l => l.trim())
    .filter(l => l.startsWith('http://') || l.startsWith('https://'));
}

document.getElementById('maps-skip-input').addEventListener('input', function () {
  const n = parseSkipText(this.value).length;
  document.getElementById('maps-skip-count').textContent = `${n} entr${n === 1 ? 'y' : 'ies'} to skip`;
});
function clearMapsSkip() {
  document.getElementById('maps-skip-input').value = '';
  document.getElementById('maps-skip-count').textContent = '0 entries to skip';
}
function parseSkipText(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

// ── Maps UI ────────────────────────────────────────────────────────
function updateMapsMeta() {
  const val = document.getElementById('maps-url-input').value.trim();
  const hint = document.getElementById('maps-url-hint');
  const okEl = document.getElementById('maps-url-ok');
  const errEl = document.getElementById('maps-url-err');

  if (!val) {
    hint.textContent = 'Paste a Google Maps search results URL';
    okEl.classList.remove('show');
    errEl.classList.remove('show');
    return;
  }

  const isValid = val.includes('google.com/maps') || val.includes('maps.google.com');

  okEl.classList.toggle('show', isValid);
  errEl.classList.toggle('show', !isValid);

  const num = parseInt(document.getElementById('maps-max-results').value, 10);
  const numLabel = num >= 9999 ? 'all available' : `up to ${num}`;
  hint.textContent = isValid
    ? `Will scrape ${numLabel} businesses from this Maps page`
    : 'URL must contain google.com/maps';
}

function setMapsMaxResults(btn) {
  document.querySelectorAll('#panel-maps .num-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('maps-max-results').value = btn.dataset.val;
  updateMapsMeta();
}

function setLinkedInMaxResults(btn) {
  document.querySelectorAll('#panel-linkedin .li-num-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('linkedin-max-results').value = btn.dataset.val;
}

// ── Option tiles ───────────────────────────────────────────────────
function toggleTile(label) {
  const cb = label.querySelector('input[type="checkbox"]');
  setTimeout(() => {
    label.classList.toggle('selected', cb.checked);
  }, 0);
}

// ── CSV ────────────────────────────────────────────────────────────
function handleDragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('over'); }
function handleDragLeave() { document.getElementById('drop-zone').classList.remove('over'); }
function handleDrop(e) { e.preventDefault(); handleDragLeave(); const f = e.dataTransfer.files[0]; if (f) processCSVFile(f); }
function handleFileUpload(e) { const f = e.target.files[0]; if (f) processCSVFile(f); }

function processCSVFile(file) {
  if (!file.name.endsWith('.csv')) { showToast('Please upload a .csv file.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseCSV(e.target.result);
    if (!parsed.rows.length) { showToast('CSV appears empty.', 'error'); return; }
    state.csvData = parsed.rows; state.csvHeaders = parsed.headers;
    const sel = document.getElementById('url-column');
    sel.innerHTML = '';
    parsed.headers.forEach((h, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = h || `Column ${i + 1}`;
      if (/url|website|domain|link|site/i.test(h)) o.selected = true;
      sel.appendChild(o);
    });
    document.getElementById('file-name-label').textContent = `${file.name} — ${parsed.rows.length} rows`;
    document.getElementById('file-ok').classList.add('show');
    document.getElementById('col-select').classList.add('show');
    updateCsvUrlCount();
  };
  reader.readAsText(file);
}
document.getElementById('url-column').addEventListener('change', updateCsvUrlCount);
function updateCsvUrlCount() {
  if (!state.csvData) return;
  const i = parseInt(document.getElementById('url-column').value, 10);
  const n = state.csvData.map(r => (r[i] || '').trim()).filter(v => v.startsWith('http')).length;
  document.getElementById('csv-url-count').textContent = `${n} valid URL${n !== 1 ? 's' : ''} in this column`;
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  return { headers: splitCSVLine(lines[0]), rows: lines.slice(1).map(splitCSVLine) };
}
function splitCSVLine(line) {
  const r = []; let c = '', q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { q = !q; continue }
    if (line[i] === ',' && !q) { r.push(c.trim()); c = ''; continue }
    c += line[i];
  }
  r.push(c.trim()); return r;
}
function collectUrls() {
  if (state.activeTab === 'urls') return parseUrlText(document.getElementById('url-input').value);
  if (!state.csvData) return [];
  const i = parseInt(document.getElementById('url-column').value, 10);
  return state.csvData.map(r => (r[i] || '').trim()).filter(v => v.startsWith('http'));
}

// ── Real API call (replaces mockScrape) ───────────────────────────
async function scrapeUrl(url) {
  const checkContactPage = document.getElementById('opt-contact')?.checked ?? true;
  const deduplicateEmails = document.getElementById('opt-dedup')?.checked ?? true;
  const controller = new AbortController();
  state.activeController = controller;

  try {
    const response = await fetch(`${API_BASE}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        url,
        check_contact_page: checkContactPage,
        deduplicate_emails: deduplicateEmails,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${response.status}`);
    }

    const data = await response.json();

    // If the backend returned an error field, treat it as a thrown error
    if (data.error) throw new Error(data.error);

    return data;
  } finally {
    if (state.activeController === controller) {
      state.activeController = null;
    }
  }
}

// ── Activity feed helpers ──────────────────────────────────────────
function buildFeedItem(idx, url, status, data) {
  const host = hostname(url);
  let dotHTML = '', metaHTML = '', foundHTML = '';

  if (status === 'pending') {
    dotHTML = `<div class="feed-dot active"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:10px;height:10px;animation:spin .7s linear infinite"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="8"/></svg></div>`;
    metaHTML = `<div class="feed-meta">Fetching homepage…</div>`;
  } else if (status === 'done') {
    dotHTML = `<div class="feed-dot done"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7"/></svg></div>`;
    const socialCount = ['facebook', 'instagram', 'linkedin'].filter(k => data?.[k]).length;
    const total = (data?.emails?.length || 0) + (data?.phones?.length || 0) + (data?.whatsapp?.length || 0) + socialCount;
    if (total > 0) {
      metaHTML = `<div class="feed-meta">${data.emails.length} email${data.emails.length !== 1 ? 's' : ''} · ${data.phones.length} phone${data.phones.length !== 1 ? 's' : ''}${data.whatsapp?.length ? ` · ${data.whatsapp.length} whatsapp` : ''} · ${socialCount} social</div>`;
      foundHTML = `<span class="feed-found ok">✓ Contact data found</span>`;
    } else {
      metaHTML = `<div class="feed-meta">Scanned — no contact data found</div>`;
      foundHTML = `<span class="feed-found empty">No data</span>`;
    }
  } else if (status === 'error') {
    dotHTML = `<div class="feed-dot" style="border-color:var(--red);color:var(--red)">✕</div>`;
    metaHTML = `<div class="feed-meta">Connection failed</div>`;
    foundHTML = `<span class="feed-found err">Error</span>`;
  } else {
    dotHTML = `<div class="feed-dot">${idx}</div>`;
    metaHTML = `<div class="feed-meta">Queued</div>`;
  }

  return `
    <div class="feed-item" id="feed-${idx}">
      ${dotHTML}
      <div class="feed-content">
        <div class="feed-label${status === 'idle' ? ' muted' : ''}">${host}</div>
        ${metaHTML}
        ${foundHTML}
      </div>
    </div>`;
}

function extractSocialsByPlatform(socials) {
  const out = { facebook: '', instagram: '', linkedin: '' };
  if (!Array.isArray(socials)) return out;
  socials.forEach(s => {
    const platform = (s.platform || '').toLowerCase();
    const url = s.url || '';
    if (platform.includes('facebook') && !out.facebook) out.facebook = url;
    else if (platform.includes('instagram') && !out.instagram) out.instagram = url;
    else if (platform.includes('linkedin') && !out.linkedin) out.linkedin = url;
  });
  return out;
}


// ── Maps flow ──────────────────────────────────────────────────────
async function startMapsFlow(mapsUrl) {
  const maxResults = parseInt(document.getElementById('maps-max-results').value, 10);
  const skipList = parseSkipText(document.getElementById('maps-skip-input').value);

  try {
    const ping = await fetch(`${API_BASE}/`);
    if (!ping.ok) throw new Error();
  } catch {
    showToast('Cannot reach backend. Is uvicorn running on port 8000?', 'error');
    return;
  }

  state.isRunning = true;
  state.stopRequested = false;
  state.results = [];
  setRunningUI(true);

  document.getElementById('input-section').style.display = 'none';
  document.getElementById('activity-feed').classList.add('show');
  document.getElementById('run-btn').disabled = true;
  document.getElementById('header-status').classList.add('show');
  document.getElementById('header-status-text').textContent = 'Loading Maps…';
  document.getElementById('progress-strip').classList.add('show');
  document.getElementById('prog-label').textContent = 'Launching browser & loading Maps page…';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('table-wrap').style.display = 'block';
  buildTableHead('maps');
  document.getElementById('results-body').innerHTML = '';
  document.getElementById('feed-list').innerHTML = '';

  let listingCount = 0;
  let mapsError = null;
  const controller = new AbortController();
  state.activeController = controller;

  try {
    const res = await fetch(`${API_BASE}/maps-scrape-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ url: mapsUrl, max_results: maxResults, skip_list: skipList }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (state.stopRequested) { reader.cancel(); break; }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineEnd;
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        if (!line) continue;

        let item;
        try { item = JSON.parse(line); } catch { continue; }

        if (item.__final__) { mapsError = item.error || null; continue; }

        // ── A real listing just arrived from the Maps feed ──
        listingCount++;
        const biz = item;
        const label = biz.website || biz.name || `Business ${listingCount}`;

        document.getElementById('prog-label').textContent = `Found ${biz.name || 'a business'} — scanning its site…`;
        document.getElementById('header-status-text').textContent = `${listingCount} found so far`;

        document.getElementById('feed-list').insertAdjacentHTML('beforeend', buildFeedItem(listingCount, label, 'pending', null));
        addMapsTableRow(listingCount, biz, 'scanning');

        if (maxResults < 9999) updateProgress(listingCount, maxResults);

        if (state.stopRequested) break;

        // Immediately scrape that business's website (sequential, same as before)
        if (biz.website) {
          try {
            const scrapeData = await scrapeUrl(biz.website);

            const mapsPhoneNorm = normalizePhone(biz.phone);
            const uniqueSitePhones = dedupePhones(scrapeData.phones)
              .filter(p => normalizePhone(p) !== mapsPhoneNorm); // drop if same as Maps phone

            const merged = {
              ...biz,
              maps_phone: biz.phone || '',
              website_phones: uniqueSitePhones,       // array, deduped, no Maps-phone duplicate
              emails: dedupePhones(scrapeData.emails), // harmless reuse — just removes exact dupes
              phones: scrapeData.phones,
              whatsapp: dedupePhones(scrapeData.whatsapp),
              maps_facebook: biz.facebook || '',
              website_facebook: scrapeData.facebook || '',
              maps_instagram: biz.instagram || '',
              website_instagram: scrapeData.instagram || '',
              maps_linkedin: biz.linkedin || '',
              website_linkedin: scrapeData.linkedin || '',
            };
            state.results.push(merged);
            updateMapsTableRow(listingCount, merged, 'done');
            const el = document.getElementById(`feed-${listingCount}`);
            if (el) el.outerHTML = buildFeedItem(listingCount, label, 'done', scrapeData);
          } catch (err) {
            const merged = {
              ...biz,
              maps_phone: biz.phone || '', website_phones: [],
              emails: [], phones: [], whatsapp: [],
              maps_facebook: biz.facebook || '', website_facebook: '',
              maps_instagram: biz.instagram || '', website_instagram: '',
              maps_linkedin: biz.linkedin || '', website_linkedin: '',
              error: err.message,
            };
            state.results.push(merged);
            updateMapsTableRow(listingCount, merged, 'error');
            const el = document.getElementById(`feed-${listingCount}`);
            if (el) el.outerHTML = buildFeedItem(listingCount, label, 'error', null);
          }
        } else {
          const merged = {
            ...biz,
            maps_phone: biz.phone || '', website_phones: [],
            emails: [], phones: [], whatsapp: [],
            maps_facebook: biz.facebook || '', website_facebook: '',
            maps_instagram: biz.instagram || '', website_instagram: '',
            maps_linkedin: biz.linkedin || '', website_linkedin: '',
          };
          state.results.push(merged);
          updateMapsTableRow(listingCount, merged, 'done');
          const el = document.getElementById(`feed-${listingCount}`);
          if (el) el.outerHTML = buildFeedItem(listingCount, label, 'done', { emails: [], phones: [], socials: [] });
        }

        const done = state.results.length;
        const withData = state.results.filter(r =>
          r.emails?.length || r.phones?.length || r.whatsapp?.length || r.facebook || r.instagram || r.linkedin || r.phone
        ).length;
        document.getElementById('results-sub').textContent = `${done} scraped · ${withData} with contact data`;
        document.getElementById('header-status-text').textContent = `${listingCount} scraped`;
      }
    }
  } catch (err) {
    if (!state.stopRequested) {
      showToast('Failed to reach maps-scrape endpoint.', 'error');
      resetToInput();
      return;
    }
  } finally {
    if (state.activeController === controller) {
      state.activeController = null;
    }
  }

  if (state.stopRequested) {
    handleStop(listingCount);
    return;
  }

  if (listingCount === 0) {
    showToast(mapsError ? `Maps error: ${mapsError}` : 'No businesses found on that Maps page.', 'error');
    resetToInput();
    return;
  }

  if (mapsError) {
    showToast(`Finished with a warning: ${mapsError}`, 'info');
  }

  finishScan(listingCount);
}


// ── LinkedIn flow ──────────────────────────────────────────────────
async function startLinkedInFlow(filters) {
  const maxResults = parseInt(document.getElementById('linkedin-max-results').value, 10);

  try {
    const ping = await fetch(`${API_BASE}/`);
    if (!ping.ok) throw new Error();
  } catch {
    showToast('Cannot reach backend. Is uvicorn running on port 8000?', 'error');
    return;
  }

  state.isRunning = true;
  state.stopRequested = false;
  state.results = [];
  setRunningUI(true);

  document.getElementById('input-section').style.display = 'none';
  document.getElementById('activity-feed').classList.add('show');
  document.getElementById('run-btn').disabled = true;
  document.getElementById('header-status').classList.add('show');
  document.getElementById('header-status-text').textContent = 'Searching…';
  document.getElementById('progress-strip').classList.add('show');
  document.getElementById('prog-label').textContent = 'Querying Google for LinkedIn profiles…';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('table-wrap').style.display = 'block';
  buildTableHead('linkedin');
  document.getElementById('results-body').innerHTML = '';
  document.getElementById('feed-list').innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/linkedin-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...filters, max_results: maxResults }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();

    if (data.error) {
      showToast(`LinkedIn search error: ${data.error}`, 'error');
      resetToInput();
      return;
    }

    data.results.forEach((person, i) => {
      state.results.push(person);
      addLinkedInTableRow(i + 1, person);
      document.getElementById('feed-list').insertAdjacentHTML(
        'beforeend',
        buildFeedItem(i + 1, person.name, 'done', null)
      );
    });

    document.getElementById('results-sub').textContent = `${data.results.length} profiles found`;
    document.getElementById('header-status-text').textContent = `${data.results.length} found`;

    if (data.results.length === 0) {
      showToast('No LinkedIn profiles found for that query.', 'info');
      resetToInput();
      return;
    }

    finishScan(data.results.length);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
    resetToInput();
  }
}

function addLinkedInTableRow(idx, person) {
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`; tr.className = 'row-appear';
  tr.innerHTML = `
    <td class="idx-cell">${idx}</td>
    <td><div style="font-size:12px;font-weight:500;color:var(--slate-800)">${person.name || '—'}</div></td>
    <td><span style="font-size:11px;color:var(--slate-500)">${person.title || '—'}</span></td>
    <td><span style="font-size:11px;color:var(--slate-500)">${person.company || '—'}</span></td>
    <td><a href="${person.url}" target="_blank" class="social-a">${person.url}</a></td>`;
  document.getElementById('results-body').appendChild(tr);
  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Maps table rows ────────────────────────────────────────────────
function addMapsTableRow(idx, biz, status) {
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`; tr.className = 'row-appear';
  tr.innerHTML = buildMapsRowHTML(idx, biz, status);
  document.getElementById('results-body').appendChild(tr);
  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateMapsTableRow(idx, biz, status) {
  const tr = document.getElementById(`row-${idx}`);
  if (tr) tr.innerHTML = buildMapsRowHTML(idx, biz, status);
}

function buildMapsRowHTML(idx, biz, status) {
  const url = biz.website || '';
  const name = biz.name || '—';
  const address = biz.address || '—';
  const rating = biz.rating ? `⭐ ${biz.rating}` : '—';
  const reviews = biz.reviews ? `(${biz.reviews})` : '';

  const emails = biz.emails ?? [];
  const whatsapp = biz.whatsapp ?? [];
  const mapsPhone = biz.maps_phone || '';
  const websitePhones = biz.website_phones ?? [];

  const hasData = emails.length || whatsapp.length || mapsPhone || websitePhones.length ||
    biz.maps_facebook || biz.website_facebook ||
    biz.maps_instagram || biz.website_instagram ||
    biz.maps_linkedin || biz.website_linkedin;

  let badge = '';
  if (status === 'scanning') badge = `<span class="badge badge-scanning">scanning</span>`;
  else if (status === 'error') badge = `<span class="badge badge-error">error</span>`;
  else if (hasData) badge = `<span class="badge badge-found">found</span>`;
  else badge = `<span class="badge badge-empty">empty</span>`;

  const websiteCell = url
    ? `<a href="${url}" target="_blank" class="site-name">${hostname(url)}</a><div class="site-url-sub">${url}</div>`
    : `<span class="muted">No website</span>`;

  const socialCell = (mapsVal, siteVal, label) => {
    if (!mapsVal && !siteVal) return `<span class="muted">—</span>`;
    const parts = [];
    if (mapsVal) parts.push(`<a href="${mapsVal}" target="_blank" class="social-a">${label} (Maps)</a>`);
    if (siteVal) parts.push(`<a href="${siteVal}" target="_blank" class="social-a">${label} (Site)</a>`);
    return parts.join('<br>');
  };

  return `
    <td class="idx-cell">${idx}</td>
    <td><div style="font-size:12px;font-weight:500;color:var(--slate-800)">${name}</div></td>
    <td><span style="font-size:11px;color:var(--slate-500)">${address}</span></td>
    <td><span style="font-size:11px;color:var(--slate-600)">${rating} ${reviews}</span></td>
    <td>${websiteCell}</td>
    <td>${badge}</td>
    <td>${mapsPhone ? `<span class="data-mono">${mapsPhone}</span>` : `<span class="muted">—</span>`}</td>
    <td>${websitePhones.length ? websitePhones.map(p => `<span class="data-mono">${p}</span>`).join('<br>') : `<span class="muted">${mapsPhone ? 'Same as Maps' : '—'}</span>`}</td>
    <td>${emails.length ? emails.map(e => `<span class="data-mono">${e}</span>`).join('<br>') : `<span class="muted">—</span>`}</td>
    <td>${whatsapp.length ? whatsapp.map(w => `<span class="data-mono">${w}</span>`).join('<br>') : `<span class="muted">—</span>`}</td>
    <td>${socialCell(biz.maps_facebook, biz.website_facebook, 'Facebook')}</td>
    <td>${socialCell(biz.maps_instagram, biz.website_instagram, 'Instagram')}</td>
    <td>${socialCell(biz.maps_linkedin, biz.website_linkedin, 'LinkedIn')}</td>`;
}

function setRunningUI(isRunning) {
  const runBtn = document.getElementById('run-btn');
  const stopBtn = document.getElementById('stop-btn');
  if (!runBtn || !stopBtn) return;
  runBtn.style.display = isRunning ? 'none' : 'flex';
  stopBtn.style.display = isRunning ? 'flex' : 'none';
  stopBtn.disabled = !isRunning;
}

function stopCurrentRun() {
  if (!state.isRunning) return;

  state.stopRequested = true;
  if (state.activeController) {
    state.activeController.abort();
  }

  document.getElementById('prog-label').textContent = 'Stopping…';
  document.getElementById('header-status-text').textContent = 'Stopping…';
  document.getElementById('stop-btn').disabled = true;
  showToast('Stopping scan — current results remain visible for download.', 'info');
}

// ── Main scraping loop ─────────────────────────────────────────────
async function startScraping() {
  if (state.isRunning) return;

  // ── Maps mode ──
  if (state.activeTab === 'maps') {
    const mapsUrl = document.getElementById('maps-url-input').value.trim();
    if (!mapsUrl) { showToast('Please paste a Google Maps URL.', 'error'); return; }
    const isValid = mapsUrl.includes('google.com/maps') || mapsUrl.includes('maps.google.com');
    if (!isValid) { showToast('Invalid Maps URL — must contain google.com/maps', 'error'); return; }
    await startMapsFlow(mapsUrl);
    return;
  }


  // ── LinkedIn mode ──
  if (state.activeTab === 'linkedin') {
    const val = id => document.getElementById(id).value.trim();
    const filters = {
      query: val('linkedin-query-input'),
      title: val('linkedin-title-input'),
      niche: val('linkedin-niche-input'),
      location: val('linkedin-location-input'),
      exclude: val('linkedin-exclude-input'),
    };
    if (!filters.query && !filters.title && !filters.niche && !filters.location) {
      showToast('Enter at least a title, niche, location, or keyword.', 'error');
      return;
    }
    await startLinkedInFlow(filters);
    return;
  }

  // ── URL / CSV mode ──
  const urls = collectUrls();
  if (!urls.length) { showToast('No valid URLs found. Add URLs starting with https://', 'error'); return; }

  try {
    const ping = await fetch(`${API_BASE}/`);
    if (!ping.ok) throw new Error();
  } catch {
    showToast('Cannot reach backend. Is uvicorn running on port 8000?', 'error');
    return;
  }

  state.isRunning = true;
  state.stopRequested = false;
  state.results = [];
  setRunningUI(true);

  document.getElementById('input-section').style.display = 'none';
  document.getElementById('activity-feed').classList.add('show');
  document.getElementById('run-btn').disabled = true;
  document.getElementById('header-status').classList.add('show');
  document.getElementById('header-status-text').textContent = `0 / ${urls.length} scanned`;

  document.getElementById('progress-strip').classList.add('show');
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('table-wrap').style.display = 'block';
  buildTableHead(state.activeTab);
  document.getElementById('results-body').innerHTML = '';

  const feedList = document.getElementById('feed-list');
  feedList.innerHTML = '';
  urls.forEach((url, i) => {
    feedList.insertAdjacentHTML('beforeend', buildFeedItem(i + 1, url, 'idle', null));
  });

  for (let i = 0; i < urls.length; i++) {
    if (state.stopRequested) break;

    const url = urls[i];

    document.getElementById(`feed-${i + 1}`).outerHTML = buildFeedItem(i + 1, url, 'pending', null);
    document.getElementById(`feed-${i + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    document.getElementById('prog-label').textContent = `Scanning ${hostname(url)}…`;
    document.getElementById('header-status-text').textContent = `${i + 1} / ${urls.length} scanning`;
    updateProgress(i, urls.length);
    addTableRow(i + 1, url, null, 'scanning');

    try {
      const data = await scrapeUrl(url);
      if (state.stopRequested) break;
      state.results.push({ url, ...data });
      updateTableRow(i + 1, url, data, 'done');
      const el = document.getElementById(`feed-${i + 1}`);
      if (el) el.outerHTML = buildFeedItem(i + 1, url, 'done', data);
    } catch (err) {
      if (state.stopRequested) break;
      state.results.push({ url, emails: [], phones: [], socials: [], error: err.message });
      updateTableRow(i + 1, url, null, 'error');
      const el = document.getElementById(`feed-${i + 1}`);
      if (el) el.outerHTML = buildFeedItem(i + 1, url, 'error', null);
    }

    updateProgress(i + 1, urls.length);
    const done = state.results.length;
    const withData = state.results.filter(r => r.emails?.length || r.phones?.length || r.socials?.length).length;
    document.getElementById('results-sub').textContent = `${done} scanned · ${withData} with contact data`;
    document.getElementById('header-status-text').textContent = `${i + 1} / ${urls.length} scanned`;
  }

  if (state.stopRequested) {
    handleStop(urls.length);
    return;
  }

  finishScan(urls.length);
}

// ── Shared finish helper ───────────────────────────────────────────
function finishScan(total) {
  state.isRunning = false;
  state.stopRequested = false;
  setRunningUI(false);
  document.getElementById('prog-label').textContent = 'Scan complete';
  document.getElementById('run-btn').disabled = false;
  document.getElementById('run-btn').innerHTML = `
    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    New scan`;
  document.getElementById('run-btn').onclick = resetToInput;
  document.getElementById('dl-btn').disabled = false;
  showToast(`Done — ${total} site${total !== 1 ? 's' : ''} scraped`, 'success');
}

function handleStop(total) {
  state.isRunning = false;
  state.stopRequested = false;
  setRunningUI(false);
  document.getElementById('prog-label').textContent = 'Scan stopped';
  document.getElementById('run-btn').disabled = false;
  document.getElementById('run-btn').innerHTML = `
    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    New scan`;
  document.getElementById('run-btn').onclick = resetToInput;
  document.getElementById('dl-btn').disabled = false;

  if (state.results.length) {
    showToast(`Stopped — ${state.results.length} collected result${state.results.length !== 1 ? 's' : ''} remain visible. Click Download CSV to export them.`, 'info');
  } else {
    showToast('Stopped — no results were collected', 'info');
  }
}

function resetToInput() {
  state.results = [];
  state.isRunning = false;
  state.stopRequested = false;
  state.activeController = null;
  setRunningUI(false);
  document.getElementById('input-section').style.display = 'block';
  document.getElementById('activity-feed').classList.remove('show');
  document.getElementById('progress-strip').classList.remove('show');
  document.getElementById('table-wrap').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('results-body').innerHTML = '';
  document.getElementById('results-sub').textContent = 'Run a scan to see results';
  document.getElementById('header-status').classList.remove('show');
  document.getElementById('dl-btn').disabled = true;
  document.getElementById('run-btn').innerHTML = `
    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    Start scraping`;
  document.getElementById('run-btn').onclick = startScraping;
  document.getElementById('run-btn').disabled = false;
  document.getElementById('feed-list').innerHTML = '';
}

// ── Progress ───────────────────────────────────────────────────────
function updateProgress(done, total) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById('prog-fill').style.width = `${pct}%`;
  document.getElementById('prog-count').textContent = `${done} / ${total}`;
}

// ── Table headers ──────────────────────────────────────────────────
function buildTableHead(mode) {
  const head = document.getElementById('table-head');
  if (!head) return;

  let cols = [];

  if (mode === 'maps') {
    cols = ['#', 'Business', 'Address', 'Rating', 'Website', 'Status', 'Maps Phone', 'Website Phone(s)', 'Emails', 'WhatsApp', 'Facebook', 'Instagram', 'LinkedIn'];
  } else if (mode === 'linkedin') {
    cols = ['#', 'Name', 'Title', 'Company', 'LinkedIn URL'];
  } else {
    cols = ['#', 'Site', 'Status', 'Emails', 'Phones', 'WhatsApp', 'Facebook', 'Instagram', 'LinkedIn'];
  }

  head.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
}

// ── Table ──────────────────────────────────────────────────────────
function addTableRow(idx, url, data, status) {
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`; tr.className = 'row-appear';
  tr.innerHTML = buildRowHTML(idx, url, data, status);
  document.getElementById('results-body').appendChild(tr);
  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function updateTableRow(idx, url, data, status) {
  const tr = document.getElementById(`row-${idx}`);
  if (tr) tr.innerHTML = buildRowHTML(idx, url, data, status);
}


function buildRowHTML(idx, url, data, status) {
  const host = hostname(url);
  let badge = '';
  const hasData = data && (data.emails.length || data.phones.length || data.whatsapp?.length ||
    data.facebook || data.instagram || data.linkedin);
  if (status === 'scanning') badge = `<span class="badge badge-scanning">scanning</span>`;
  else if (status === 'error') badge = `<span class="badge badge-error">error</span>`;
  else if (hasData) badge = `<span class="badge badge-found">found</span>`;
  else badge = `<span class="badge badge-empty">empty</span>`;

  const emails = data?.emails ?? [];
  const phones = data?.phones ?? [];
  const whatsapp = data?.whatsapp ?? [];

  return `
    <td class="idx-cell">${idx}</td>
    <td><a href="${url}" target="_blank" class="site-name">${host}</a><div class="site-url-sub">${url}</div></td>
    <td>${badge}</td>
    <td>${emails.length ? emails.map(e => `<span class="data-mono">${e}</span>`).join('') : `<span class="muted">—</span>`}</td>
    <td>${phones.length ? phones.map(p => `<span class="data-mono">${p}</span>`).join('') : `<span class="muted">—</span>`}</td>
    <td>${whatsapp.length ? whatsapp.map(w => `<span class="data-mono">${w}</span>`).join('') : `<span class="muted">—</span>`}</td>
    <td>${data?.facebook ? `<a href="${data.facebook}" target="_blank" class="social-a">Facebook</a>` : `<span class="muted">—</span>`}</td>
    <td>${data?.instagram ? `<a href="${data.instagram}" target="_blank" class="social-a">Instagram</a>` : `<span class="muted">—</span>`}</td>
    <td>${data?.linkedin ? `<a href="${data.linkedin}" target="_blank" class="social-a">LinkedIn</a>` : `<span class="muted">—</span>`}</td>`;
}

function downloadCSV() {
  if (!state.results.length) return;

  let csv = '';

  if (state.activeTab === 'maps') {
    // How many "Website Phone" columns we need — sized to the busiest result
    const maxSitePhones = Math.max(1, ...state.results.map(r => (r.website_phones || []).length));
    const sitePhoneHeaders = Array.from({ length: maxSitePhones }, (_, i) => `Website Phone ${i + 1}`);

    csv += ['Business Name', 'Address', 'Rating', 'Reviews', 'Website',
      'Maps Phone', ...sitePhoneHeaders, 'Emails', 'WhatsApp',
      'Maps Facebook', 'Website Facebook',
      'Maps Instagram', 'Website Instagram',
      'Maps LinkedIn', 'Website LinkedIn']
      .map(csvEscape).join(',') + '\n';

    state.results.forEach(r => {
      const sitePhones = r.website_phones || [];
      const sitePhoneCells = Array.from({ length: maxSitePhones }, (_, i) => csvSafePhone(sitePhones[i] ?? ''));

      csv += [
        r.name ?? '',
        r.address ?? '',
        r.rating ?? '',
        r.reviews ?? '',
        r.website ?? '',
        csvSafePhone(r.maps_phone ?? ''),
        ...sitePhoneCells,
        [...new Set(r.emails || [])].join(' | '),
        (r.whatsapp || []).map(csvSafePhone).join(' | '),
        r.maps_facebook ?? '',
        r.website_facebook ?? '',
        r.maps_instagram ?? '',
        r.website_instagram ?? '',
        r.maps_linkedin ?? '',
        r.website_linkedin ?? '',
      ].map(csvEscape).join(',') + '\n';
    });
  } else if (state.activeTab === 'linkedin') {
    csv += ['Name', 'Title', 'Company', 'LinkedIn URL'].map(csvEscape).join(',') + '\n';
    state.results.forEach(r => {
      csv += [r.name ?? '', r.title ?? '', r.company ?? '', r.url ?? ''].map(csvEscape).join(',') + '\n';
    });
  } else if (state.activeTab === 'csv' && state.csvData) {
    const colIdx = parseInt(document.getElementById('url-column').value, 10);
    csv += [...state.csvHeaders, 'Emails', 'Phone Numbers', 'WhatsApp', 'Facebook', 'Instagram', 'LinkedIn']
      .map(csvEscape).join(',') + '\n';
    state.csvData.forEach(row => {
      const url = (row[colIdx] || '').trim();
      const result = state.results.find(r => r.url === url);
      csv += [
        ...row,
        result?.emails?.join(' | ') ?? '',
        result?.phones?.join(' | ') ?? '',
        result?.whatsapp?.join(' | ') ?? '',
        result?.facebook ?? '',
        result?.instagram ?? '',
        result?.linkedin ?? '',
      ].map(csvEscape).join(',') + '\n';
    });

  } else {
    csv += ['URL', 'Emails', 'Phone Numbers', 'WhatsApp', 'Facebook', 'Instagram', 'LinkedIn'].map(csvEscape).join(',') + '\n';
    state.results.forEach(r => {
      csv += [
        r.url,
        [...new Set(r.emails || [])].join(' | '),
        dedupePhones(r.phones).map(csvSafePhone).join(' | '),
        dedupePhones(r.whatsapp).map(csvSafePhone).join(' | '),
        r.facebook ?? '',
        r.instagram ?? '',
        r.linkedin ?? '',
      ].map(csvEscape).join(',') + '\n';
    });
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `webtrace-${state.activeTab}-${datestamp()}.csv`,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function csvEscape(v) {
  const s = String(v ?? '');
  if (/^="/.test(s) && s.endsWith('"')) return s; // already Sheets-safe, don't re-wrap
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Helpers ────────────────────────────────────────────────────────
function hostname(url) { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } }
function datestamp() { return new Date().toISOString().slice(0, 10); }
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Phone dedup + Sheets-safe formatting ────────────────────────────
function normalizePhone(p) {
  return (p || '').replace(/\D/g, '');
}
function dedupePhones(arr) {
  const seen = new Set();
  const out = [];
  for (const p of arr || []) {
    const norm = normalizePhone(p);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(p);
  }
  return out;
}
// Prevents Google Sheets / Excel from reading a leading +, -, =, or @
// as the start of a formula, which is what causes the paste error.
function csvSafePhone(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^[+\-=@]/.test(s)) {
    return `="${s.replace(/"/g, '""')}"`;
  }
  return s;
}