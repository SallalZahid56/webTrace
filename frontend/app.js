// WebTrace — app.js
// All Tailwind class references removed; uses plain CSS classes from style.css

const state = {
  activeTab: 'urls',
  csvData: null,
  csvHeaders: [],
  results: [],
  isRunning: false,
};

// ── Tab switching ─────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  ['urls', 'csv'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`panel-${t}`).classList.toggle('hidden', t !== tab);
  });
}

// ── URL input ─────────────────────────────────────────────────────
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
    .filter(l => l.length > 0 && (l.startsWith('http://') || l.startsWith('https://')));
}

// ── CSV Upload ────────────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('over');
}
function handleDragLeave() {
  document.getElementById('drop-zone').classList.remove('over');
}
function handleDrop(e) {
  e.preventDefault();
  handleDragLeave();
  const file = e.dataTransfer.files[0];
  if (file) processCSVFile(file);
}
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) processCSVFile(file);
}

function processCSVFile(file) {
  if (!file.name.endsWith('.csv')) { alert('Please upload a .csv file.'); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const parsed = parseCSV(e.target.result);
    if (parsed.rows.length === 0) { alert('CSV appears empty or could not be parsed.'); return; }
    state.csvData    = parsed.rows;
    state.csvHeaders = parsed.headers;

    const sel = document.getElementById('url-column');
    sel.innerHTML = '';
    parsed.headers.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = h || `Column ${i + 1}`;
      if (/url|website|domain|link|site/i.test(h)) opt.selected = true;
      sel.appendChild(opt);
    });

    document.getElementById('file-name-label').textContent =
      `${file.name} — ${parsed.rows.length} row${parsed.rows.length !== 1 ? 's' : ''} loaded`;
    document.getElementById('col-selector').classList.add('show');
    updateCsvUrlCount();
  };
  reader.readAsText(file);
}

document.getElementById('url-column')?.addEventListener('change', updateCsvUrlCount);

function updateCsvUrlCount() {
  if (!state.csvData) return;
  const colIdx = parseInt(document.getElementById('url-column').value, 10);
  const urls = state.csvData.map(row => (row[colIdx] || '').trim()).filter(v => v.startsWith('http'));
  document.getElementById('csv-url-count').textContent =
    `${urls.length} valid URL${urls.length !== 1 ? 's' : ''} found in this column`;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  return { headers: splitCSVLine(lines[0]), rows: lines.slice(1).map(splitCSVLine) };
}

function splitCSVLine(line) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

// ── Collect URLs ──────────────────────────────────────────────────
function collectUrls() {
  if (state.activeTab === 'urls') return parseUrlText(document.getElementById('url-input').value);
  if (!state.csvData) return [];
  const colIdx = parseInt(document.getElementById('url-column').value, 10);
  return state.csvData.map(row => (row[colIdx] || '').trim()).filter(v => v.startsWith('http'));
}

// ── Start Scraping ────────────────────────────────────────────────
async function startScraping() {
  if (state.isRunning) return;
  const urls = collectUrls();
  if (!urls.length) { showToast('No valid URLs found. Add URLs starting with https://', 'error'); return; }

  state.isRunning = true;
  state.results   = [];

  document.getElementById('results-body').innerHTML = '';
  document.getElementById('results-section').classList.add('show');
  document.getElementById('progress-section').classList.add('show');
  document.getElementById('header-status').classList.add('show');
  document.getElementById('download-btn').disabled = true;
  document.getElementById('start-btn').disabled    = true;
  document.getElementById('results-summary').textContent = 'Scanning…';

  updateProgress(0, urls.length);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    document.getElementById('progress-label').textContent    = `Scanning ${hostname(url)}…`;
    document.getElementById('header-status-text').textContent = `${i + 1} / ${urls.length} sites`;
    updateProgress(i, urls.length);
    addResultRow(i + 1, url, null);

    try {
      const data = await mockScrape(url);
      state.results.push({ url, ...data });
      updateResultRow(i + 1, url, data, 'done');
    } catch (err) {
      state.results.push({ url, emails: [], phones: [], socials: [], error: err.message });
      updateResultRow(i + 1, url, null, 'error');
    }

    updateProgress(i + 1, urls.length);
    updateResultsSummary();
  }

  state.isRunning = false;
  document.getElementById('progress-label').textContent    = 'Done!';
  document.getElementById('header-status-text').textContent = `${urls.length} sites scanned`;
  document.getElementById('download-btn').disabled = false;
  document.getElementById('start-btn').disabled    = false;
  showToast(`Scraping complete — ${urls.length} site${urls.length !== 1 ? 's' : ''} processed`, 'success');
}

// ── Progress ──────────────────────────────────────────────────────
function updateProgress(done, total) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById('progress-bar').style.width  = `${pct}%`;
  document.getElementById('progress-count').textContent = `${done} / ${total}`;
}

// ── Results table ─────────────────────────────────────────────────
function addResultRow(idx, url, data) {
  const tbody = document.getElementById('results-body');
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`;
  tr.className = 'row-appear';
  tr.innerHTML = buildRowHTML(idx, url, data, 'pending');
  tbody.appendChild(tr);
  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateResultRow(idx, url, data, status) {
  const tr = document.getElementById(`row-${idx}`);
  if (tr) tr.innerHTML = buildRowHTML(idx, url, data, status);
}

function buildRowHTML(idx, url, data, status) {
  const host = hostname(url);

  let badge = '';
  if (status === 'pending') {
    badge = `<span class="badge badge-scanning"><span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> scanning</span>`;
  } else if (status === 'error') {
    badge = `<span class="badge badge-error">error</span>`;
  } else if (data && (data.emails.length || data.phones.length || data.socials.length)) {
    badge = `<span class="badge badge-found">found</span>`;
  } else {
    badge = `<span class="badge badge-empty">empty</span>`;
  }

  const emails  = data?.emails  ?? [];
  const phones  = data?.phones  ?? [];
  const socials = data?.socials ?? [];

  const emailsH  = emails.length  ? emails.map(e => `<span class="data-mono">${e}</span>`).join('') : `<span class="muted">—</span>`;
  const phonesH  = phones.length  ? phones.map(p => `<span class="data-mono">${p}</span>`).join('') : `<span class="muted">—</span>`;
  const socialsH = socials.length ? socials.map(s =>
    `<a href="${s.url}" target="_blank" class="social-a">${socialIcon(s.platform)}<span>${s.platform}</span></a>`
  ).join('') : `<span class="muted">—</span>`;

  return `
    <td class="idx-cell">${idx}</td>
    <td>
      <a href="${url}" target="_blank" class="site-name">${host}</a>
      <div class="site-url">${url}</div>
    </td>
    <td>${badge}</td>
    <td>${emailsH}</td>
    <td>${phonesH}</td>
    <td>${socialsH}</td>
  `;
}

function updateResultsSummary() {
  const done     = state.results.length;
  const withData = state.results.filter(r => r.emails?.length || r.phones?.length || r.socials?.length).length;
  document.getElementById('results-summary').textContent = `${done} scanned · ${withData} with contact data`;
}

// ── Social icons ──────────────────────────────────────────────────
function socialIcon(platform) {
  const icons = {
    linkedin:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
    twitter:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    facebook:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
    youtube:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.57A2.78 2.78 0 0 0 3.41 19.5C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon fill="white" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>`,
    github:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>`,
    tiktok:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 12.67 0l-.01-8.83a8.18 8.18 0 0 0 4.78 1.52V4.55a4.85 4.85 0 0 1-1-.14z"/></svg>`,
  };
  return icons[platform] || '';
}

// ── Download CSV ──────────────────────────────────────────────────
function downloadCSV() {
  if (!state.results.length) return;
  const isCSVMode = state.activeTab === 'csv' && state.csvData;
  let csv = '';

  if (isCSVMode) {
    const colIdx = parseInt(document.getElementById('url-column').value, 10);
    csv += [...state.csvHeaders, 'Emails', 'Phone Numbers', 'Social Links'].map(csvEscape).join(',') + '\n';
    state.csvData.forEach(row => {
      const url     = (row[colIdx] || '').trim();
      const result  = state.results.find(r => r.url === url);
      csv += [...row, result?.emails?.join(' | ') ?? '', result?.phones?.join(' | ') ?? '', result?.socials?.map(s => s.url).join(' | ') ?? ''].map(csvEscape).join(',') + '\n';
    });
  } else {
    csv += ['URL','Emails','Phone Numbers','Social Links'].join(',') + '\n';
    state.results.forEach(r => {
      csv += [r.url, r.emails?.join(' | ') ?? '', r.phones?.join(' | ') ?? '', r.socials?.map(s => s.url).join(' | ') ?? ''].map(csvEscape).join(',') + '\n';
    });
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `webtrace-${datestamp()}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Helpers ───────────────────────────────────────────────────────
function hostname(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}
function datestamp() { return new Date().toISOString().slice(0, 10); }

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(6px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Mock scraper (replace with real FastAPI call) ─────────────────
async function mockScrape(url) {
  await sleep(600 + Math.random() * 1200);
  if (Math.random() < 0.15) throw new Error('Connection timeout');
  const host = hostname(url);
  const hasEmail  = Math.random() > 0.25;
  const hasPhone  = Math.random() > 0.45;
  const numSocial = Math.floor(Math.random() * 4);
  const allSocials = [
    { platform: 'linkedin',  url: `https://linkedin.com/company/${host}` },
    { platform: 'twitter',   url: `https://twitter.com/${host}` },
    { platform: 'facebook',  url: `https://facebook.com/${host}` },
    { platform: 'instagram', url: `https://instagram.com/${host}` },
    { platform: 'youtube',   url: `https://youtube.com/@${host}` },
    { platform: 'github',    url: `https://github.com/${host}` },
  ];
  return {
    emails:  hasEmail  ? [`info@${host}`, `contact@${host}`].slice(0, 1 + Math.floor(Math.random() * 2)) : [],
    phones:  hasPhone  ? [`+1 (555) ${Math.floor(100 + Math.random()*900)}-${Math.floor(1000 + Math.random()*9000)}`] : [],
    socials: shuffle(allSocials).slice(0, numSocial),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}