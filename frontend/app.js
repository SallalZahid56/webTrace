// ═══════════════════════════════════════════════════════════════
//  WebTrace — app.js
//  Frontend logic: tabs, CSV upload, live results table, CSV export
//  Backend calls are MOCKED here — will be wired to FastAPI later
// ═══════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────
const state = {
  activeTab: 'urls',
  csvData: null,       // parsed rows from uploaded CSV
  csvHeaders: [],
  urlColumnIndex: -1,
  results: [],
  isRunning: false,
};

// ── Tab switching ─────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  const tabs   = ['urls', 'csv'];
  tabs.forEach(t => {
    document.getElementById(`tab-${t}`).className =
      t === tab ? 'tab-active py-3 text-sm font-medium transition-colors'
                : 'tab-inactive py-3 text-sm font-medium transition-colors';
    document.getElementById(`panel-${t}`).classList.toggle('hidden', t !== tab);
  });
}

// ── URL input: count updater ──────────────────────────────────────
document.getElementById('url-input').addEventListener('input', function () {
  const urls = parseUrlText(this.value);
  document.getElementById('url-count').textContent =
    urls.length === 0 ? '0 URLs entered'
    : `${urls.length} URL${urls.length > 1 ? 's' : ''} entered`;
});

function clearUrls() {
  document.getElementById('url-input').value = '';
  document.getElementById('url-count').textContent = '0 URLs entered';
}

function parseUrlText(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && (l.startsWith('http://') || l.startsWith('https://')));
}

// ── CSV Upload ────────────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('border-brand-500/60', 'bg-brand-500/5');
}
function handleDragLeave() {
  document.getElementById('drop-zone').classList.remove('border-brand-500/60', 'bg-brand-500/5');
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
  if (!file.name.endsWith('.csv')) {
    alert('Please upload a .csv file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const parsed = parseCSV(text);
    if (parsed.rows.length === 0) {
      alert('CSV appears to be empty or could not be parsed.');
      return;
    }
    state.csvData    = parsed.rows;
    state.csvHeaders = parsed.headers;

    // Populate column selector
    const sel = document.getElementById('url-column');
    sel.innerHTML = '';
    parsed.headers.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = h || `Column ${i + 1}`;
      // Auto-select columns that look like URL columns
      if (/url|website|domain|link|site/i.test(h)) opt.selected = true;
      sel.appendChild(opt);
    });

    document.getElementById('file-name-label').textContent =
      `${file.name} — ${parsed.rows.length} row${parsed.rows.length !== 1 ? 's' : ''} loaded`;
    document.getElementById('col-selector').classList.remove('hidden');

    updateCsvUrlCount();
  };
  reader.readAsText(file);
}

document.getElementById('url-column')?.addEventListener('change', updateCsvUrlCount);

function updateCsvUrlCount() {
  if (!state.csvData) return;
  const colIdx = parseInt(document.getElementById('url-column').value, 10);
  const urls = state.csvData
    .map(row => (row[colIdx] || '').trim())
    .filter(v => v.startsWith('http'));
  document.getElementById('csv-url-count').textContent =
    `${urls.length} valid URL${urls.length !== 1 ? 's' : ''} found in this column`;
}

// Simple CSV parser (handles quoted fields)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => splitCSVLine(l));
  return { headers, rows };
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

// ── Collect URLs from active tab ──────────────────────────────────
function collectUrls() {
  if (state.activeTab === 'urls') {
    return parseUrlText(document.getElementById('url-input').value);
  } else {
    if (!state.csvData) return [];
    const colIdx = parseInt(document.getElementById('url-column').value, 10);
    return state.csvData
      .map(row => (row[colIdx] || '').trim())
      .filter(v => v.startsWith('http'));
  }
}

// ── Main: Start Scraping ──────────────────────────────────────────
async function startScraping() {
  if (state.isRunning) return;

  const urls = collectUrls();
  if (urls.length === 0) {
    showToast('No valid URLs found. Add URLs starting with https://', 'error');
    return;
  }

  state.isRunning = true;
  state.results = [];

  // Reset UI
  document.getElementById('results-body').innerHTML = '';
  document.getElementById('results-section').classList.remove('hidden');
  document.getElementById('progress-section').classList.remove('hidden');
  document.getElementById('header-status').classList.replace('hidden', 'flex');
  document.getElementById('download-btn').disabled = true;
  document.getElementById('start-btn').disabled = true;
  document.getElementById('results-summary').textContent = 'Scanning…';

  updateProgress(0, urls.length);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    document.getElementById('progress-label').textContent = `Scanning ${hostname(url)}…`;
    document.getElementById('header-status-text').textContent = `${i + 1} / ${urls.length} sites`;
    updateProgress(i, urls.length);

    // Add placeholder row immediately
    addResultRow(i + 1, url, null);

    try {
      // ── MOCK: replace this with real fetch to backend ──────────
      const data = await mockScrape(url);
      // ── END MOCK ───────────────────────────────────────────────
      state.results.push({ url, ...data });
      updateResultRow(i + 1, url, data, 'done');
    } catch (err) {
      state.results.push({ url, emails: [], phones: [], socials: [], error: err.message });
      updateResultRow(i + 1, url, null, 'error');
    }

    updateProgress(i + 1, urls.length);
    updateResultsSummary();
  }

  // Done
  state.isRunning = false;
  document.getElementById('progress-label').textContent = 'Done!';
  document.getElementById('header-status-text').textContent = `${urls.length} sites scanned`;
  document.getElementById('download-btn').disabled = false;
  document.getElementById('start-btn').disabled = false;
  showToast(`Scraping complete — ${urls.length} site${urls.length !== 1 ? 's' : ''} processed`, 'success');
}

// ── Progress ──────────────────────────────────────────────────────
function updateProgress(done, total) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('progress-count').textContent = `${done} / ${total}`;
}

// ── Results Table ─────────────────────────────────────────────────
function addResultRow(idx, url, data) {
  const tbody = document.getElementById('results-body');
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`;
  tr.className = 'row-appear hover:bg-white/[0.02] transition-colors';
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

  // Status badge
  let badge = '';
  if (status === 'pending') {
    badge = `<span class="badge-pending inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono">
      <span class="spinner inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full"></span>
      scanning
    </span>`;
  } else if (status === 'error') {
    badge = `<span class="badge-error px-2 py-0.5 rounded-md text-xs font-mono">error</span>`;
  } else if (data && (data.emails.length > 0 || data.phones.length > 0 || data.socials.length > 0)) {
    badge = `<span class="badge-success px-2 py-0.5 rounded-md text-xs font-mono">found</span>`;
  } else {
    badge = `<span class="badge-partial px-2 py-0.5 rounded-md text-xs font-mono">empty</span>`;
  }

  const emails  = data?.emails  ?? [];
  const phones  = data?.phones  ?? [];
  const socials = data?.socials ?? [];

  const emailsHTML  = emails.length  ? emails.map(e  => `<span class="font-mono text-slate-300">${e}</span>`).join('<br/>') : `<span class="text-muted">—</span>`;
  const phonesHTML  = phones.length  ? phones.map(p  => `<span class="font-mono text-slate-300">${p}</span>`).join('<br/>') : `<span class="text-muted">—</span>`;
  const socialsHTML = socials.length ? socials.map(s => `<a href="${s.url}" target="_blank" class="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 transition-colors">${socialIcon(s.platform)}<span class="font-mono">${s.platform}</span></a>`).join('<br/>') : `<span class="text-muted">—</span>`;

  return `
    <td class="px-4 py-3 text-muted font-mono">${idx}</td>
    <td class="px-4 py-3">
      <a href="${url}" target="_blank" class="text-slate-200 hover:text-brand-400 transition-colors font-medium">${host}</a>
      <div class="text-muted font-mono text-xs mt-0.5 truncate max-w-[200px]">${url}</div>
    </td>
    <td class="px-4 py-3">${badge}</td>
    <td class="px-4 py-3 leading-5">${emailsHTML}</td>
    <td class="px-4 py-3 leading-5">${phonesHTML}</td>
    <td class="px-4 py-3 leading-5">${socialsHTML}</td>
  `;
}

function updateResultsSummary() {
  const done     = state.results.length;
  const withData = state.results.filter(r => r.emails?.length || r.phones?.length || r.socials?.length).length;
  document.getElementById('results-summary').textContent =
    `${done} scanned · ${withData} with contact data`;
}

// ── Social icons (simple text labels mapped to SVG-ish emoji) ─────
function socialIcon(platform) {
  const icons = {
    linkedin:  `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
    twitter:   `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    facebook:  `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
    instagram: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
    youtube:   `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.57A2.78 2.78 0 0 0 3.41 19.5C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon fill="#0f172a" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>`,
    github:    `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>`,
    tiktok:    `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.18 8.18 0 0 0 4.78 1.52V4.55a4.85 4.85 0 0 1-1-.14z"/></svg>`,
  };
  return icons[platform] || '';
}

// ── Download CSV ──────────────────────────────────────────────────
function downloadCSV() {
  if (state.results.length === 0) return;

  const isCSVMode = state.activeTab === 'csv' && state.csvData;
  let csvContent = '';

  if (isCSVMode) {
    // Append columns to existing CSV
    const colIdx   = parseInt(document.getElementById('url-column').value, 10);
    const newCols  = ['Emails', 'Phone Numbers', 'Social Links'];
    const headers  = [...state.csvHeaders, ...newCols];
    csvContent += headers.map(csvEscape).join(',') + '\n';

    state.csvData.forEach((row, i) => {
      const url     = (row[colIdx] || '').trim();
      const result  = state.results.find(r => r.url === url);
      const emails  = result?.emails?.join(' | ') ?? '';
      const phones  = result?.phones?.join(' | ') ?? '';
      const socials = result?.socials?.map(s => s.url).join(' | ') ?? '';
      csvContent += [...row, emails, phones, socials].map(csvEscape).join(',') + '\n';
    });
  } else {
    // Fresh CSV from URL list
    const headers = ['URL', 'Emails', 'Phone Numbers', 'Social Links'];
    csvContent += headers.join(',') + '\n';

    state.results.forEach(r => {
      const emails  = r.emails?.join(' | ')              ?? '';
      const phones  = r.phones?.join(' | ')              ?? '';
      const socials = r.socials?.map(s => s.url).join(' | ') ?? '';
      csvContent += [r.url, emails, phones, socials].map(csvEscape).join(',') + '\n';
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `webtrace-${datestamp()}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Helpers ───────────────────────────────────────────────────────
function hostname(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function datestamp() {
  return new Date().toISOString().slice(0, 10);
}

function showToast(msg, type = 'info') {
  const colors = {
    success: 'bg-green-500/10 border-green-500/30 text-green-300',
    error:   'bg-red-500/10  border-red-500/30  text-red-300',
    info:    'bg-brand-500/10 border-brand-500/30 text-brand-300',
  };
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 right-6 z-50 border rounded-lg px-4 py-3 text-sm font-medium shadow-xl transition-all ${colors[type]}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── MOCK SCRAPER (replace with real backend call later) ───────────
// This simulates what the Python backend will return
async function mockScrape(url) {
  // Fake network delay: 600ms – 1.8s
  await sleep(600 + Math.random() * 1200);

  // ~80% chance of finding something
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
    emails: hasEmail ? [`info@${host}`, `contact@${host}`].slice(0, 1 + Math.floor(Math.random() * 2)) : [],
    phones: hasPhone ? ['+1 (555) ' + Math.floor(100 + Math.random() * 900) + '-' + Math.floor(1000 + Math.random() * 9000)] : [],
    socials: shuffle(allSocials).slice(0, numSocial),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}