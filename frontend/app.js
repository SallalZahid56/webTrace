// ── State ──────────────────────────────────────────────────────────
const state = {
  activeTab: 'urls',
  csvData: null,
  csvHeaders: [],
  results: [],
  isRunning: false,
};

// ── Tab switching ──────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  document.getElementById('tab-urls').classList.toggle('active', tab === 'urls');
  document.getElementById('tab-csv').classList.toggle('active', tab === 'csv');
  document.getElementById('panel-urls').style.display = tab === 'urls' ? 'block' : 'none';
  document.getElementById('panel-csv').style.display  = tab === 'csv'  ? 'block' : 'none';
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
      o.value = i; o.textContent = h || `Column ${i+1}`;
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
  const n = state.csvData.map(r => (r[i]||'').trim()).filter(v => v.startsWith('http')).length;
  document.getElementById('csv-url-count').textContent = `${n} valid URL${n!==1?'s':''} in this column`;
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  return { headers: splitCSVLine(lines[0]), rows: lines.slice(1).map(splitCSVLine) };
}
function splitCSVLine(line) {
  const r=[]; let c='',q=false;
  for (let i=0;i<line.length;i++){
    if(line[i]==='"'){q=!q;continue}
    if(line[i]===','&&!q){r.push(c.trim());c='';continue}
    c+=line[i];
  }
  r.push(c.trim()); return r;
}
function collectUrls() {
  if (state.activeTab === 'urls') return parseUrlText(document.getElementById('url-input').value);
  if (!state.csvData) return [];
  const i = parseInt(document.getElementById('url-column').value, 10);
  return state.csvData.map(r => (r[i]||'').trim()).filter(v => v.startsWith('http'));
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
    const total = (data?.emails?.length||0) + (data?.phones?.length||0) + (data?.socials?.length||0);
    if (total > 0) {
      metaHTML = `<div class="feed-meta">${data.emails.length} email${data.emails.length!==1?'s':''} · ${data.phones.length} phone${data.phones.length!==1?'s':''} · ${data.socials.length} social</div>`;
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
        <div class="feed-label${status==='idle'?' muted':''}">${host}</div>
        ${metaHTML}
        ${foundHTML}
      </div>
    </div>`;
}

// ── Main scraping loop ─────────────────────────────────────────────
async function startScraping() {
  if (state.isRunning) return;
  const urls = collectUrls();
  if (!urls.length) { showToast('No valid URLs found. Add URLs starting with https://', 'error'); return; }

  state.isRunning = true;
  state.results = [];

  // Switch left pane to feed view
  document.getElementById('input-section').style.display = 'none';
  document.getElementById('activity-feed').classList.add('show');
  document.getElementById('run-btn').disabled = true;
  document.getElementById('header-status').classList.add('show');
  document.getElementById('header-status-text').textContent = `0 / ${urls.length} scanned`;

  // Show progress strip + table
  document.getElementById('progress-strip').classList.add('show');
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('table-wrap').style.display = 'block';
  document.getElementById('results-body').innerHTML = '';

  // Pre-populate feed with all URLs as idle
  const feedList = document.getElementById('feed-list');
  feedList.innerHTML = '';
  urls.forEach((url, i) => {
    feedList.insertAdjacentHTML('beforeend', buildFeedItem(i+1, url, 'idle', null));
  });

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    // Mark as active in feed
    document.getElementById(`feed-${i+1}`).outerHTML = buildFeedItem(i+1, url, 'pending', null);
    document.getElementById(`feed-${i+1}`)?.scrollIntoView({behavior:'smooth',block:'nearest'});

    document.getElementById('prog-label').textContent = `Scanning ${hostname(url)}…`;
    document.getElementById('header-status-text').textContent = `${i+1} / ${urls.length} scanning`;
    updateProgress(i, urls.length);
    addTableRow(i+1, url, null, 'scanning');

    try {
      const data = await mockScrape(url);
      state.results.push({ url, ...data });
      updateTableRow(i+1, url, data, 'done');
      // Update feed item
      const el = document.getElementById(`feed-${i+1}`);
      if (el) el.outerHTML = buildFeedItem(i+1, url, 'done', data);
    } catch(err) {
      state.results.push({ url, emails:[], phones:[], socials:[], error: err.message });
      updateTableRow(i+1, url, null, 'error');
      const el = document.getElementById(`feed-${i+1}`);
      if (el) el.outerHTML = buildFeedItem(i+1, url, 'error', null);
    }

    updateProgress(i+1, urls.length);
    const done = state.results.length;
    const withData = state.results.filter(r => r.emails?.length||r.phones?.length||r.socials?.length).length;
    document.getElementById('results-sub').textContent = `${done} scanned · ${withData} with contact data`;
    document.getElementById('header-status-text').textContent = `${i+1} / ${urls.length} scanned`;
  }

  // Done
  state.isRunning = false;
  document.getElementById('prog-label').textContent = 'Scan complete';
  document.getElementById('run-btn').disabled = false;
  document.getElementById('run-btn').innerHTML = `
    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    New scan`;
  document.getElementById('run-btn').onclick = resetToInput;
  document.getElementById('dl-btn').disabled = false;
  showToast(`Done — ${urls.length} site${urls.length!==1?'s':''} scanned`, 'success');
}

function resetToInput() {
  state.results = [];
  state.isRunning = false;
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
  const pct = total === 0 ? 0 : Math.round((done/total)*100);
  document.getElementById('prog-fill').style.width = `${pct}%`;
  document.getElementById('prog-count').textContent = `${done} / ${total}`;
}

// ── Table ──────────────────────────────────────────────────────────
function addTableRow(idx, url, data, status) {
  const tr = document.createElement('tr');
  tr.id = `row-${idx}`; tr.className = 'row-appear';
  tr.innerHTML = buildRowHTML(idx, url, data, status);
  document.getElementById('results-body').appendChild(tr);
  tr.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function updateTableRow(idx, url, data, status) {
  const tr = document.getElementById(`row-${idx}`);
  if (tr) tr.innerHTML = buildRowHTML(idx, url, data, status);
}
function buildRowHTML(idx, url, data, status) {
  const host = hostname(url);
  let badge = '';
  if (status==='scanning') badge = `<span class="badge badge-scanning">scanning</span>`;
  else if (status==='error') badge = `<span class="badge badge-error">error</span>`;
  else if (data && (data.emails.length||data.phones.length||data.socials.length)) badge = `<span class="badge badge-found">found</span>`;
  else badge = `<span class="badge badge-empty">empty</span>`;

  const emails  = data?.emails  ?? [];
  const phones  = data?.phones  ?? [];
  const socials = data?.socials ?? [];

  return `
    <td class="idx-cell">${idx}</td>
    <td><a href="${url}" target="_blank" class="site-name">${host}</a><div class="site-url-sub">${url}</div></td>
    <td>${badge}</td>
    <td>${emails.length ? emails.map(e=>`<span class="data-mono">${e}</span>`).join('') : `<span class="muted">—</span>`}</td>
    <td>${phones.length ? phones.map(p=>`<span class="data-mono">${p}</span>`).join('') : `<span class="muted">—</span>`}</td>
    <td>${socials.length ? socials.map(s=>`<a href="${s.url}" target="_blank" class="social-a">${s.platform}</a>`).join('') : `<span class="muted">—</span>`}</td>`;
}

// ── Download ───────────────────────────────────────────────────────
function downloadCSV() {
  if (!state.results.length) return;
  let csv = 'URL,Emails,Phone Numbers,Social Links\n';
  state.results.forEach(r => {
    csv += [r.url, r.emails?.join(' | ')??'', r.phones?.join(' | ')??'', r.socials?.map(s=>s.url).join(' | ')??''].map(csvEscape).join(',') + '\n';
  });
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {href:url,download:`webtrace-${datestamp()}.csv`});
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function csvEscape(v) { const s=String(v??''); return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s; }

// ── Helpers ────────────────────────────────────────────────────────
function hostname(url) { try { return new URL(url).hostname.replace('www.',''); } catch { return url; } }
function datestamp() { return new Date().toISOString().slice(0,10); }
function showToast(msg, type='info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(6px)'; setTimeout(()=>t.remove(),300); }, 3000);
}

// ── Mock scraper ───────────────────────────────────────────────────
async function mockScrape(url) {
  await sleep(700 + Math.random() * 1100);
  if (Math.random() < 0.12) throw new Error('Timeout');
  const host = hostname(url);
  const hasEmail  = Math.random() > 0.25;
  const hasPhone  = Math.random() > 0.45;
  const numSocial = Math.floor(Math.random() * 4);
  const allSocials = [
    {platform:'linkedin',  url:`https://linkedin.com/company/${host}`},
    {platform:'twitter',   url:`https://twitter.com/${host}`},
    {platform:'facebook',  url:`https://facebook.com/${host}`},
    {platform:'instagram', url:`https://instagram.com/${host}`},
    {platform:'github',    url:`https://github.com/${host}`},
  ];
  return {
    emails:  hasEmail ? [`info@${host}`,`contact@${host}`].slice(0,1+Math.floor(Math.random()*2)) : [],
    phones:  hasPhone ? [`+1 (555) ${Math.floor(100+Math.random()*900)}-${Math.floor(1000+Math.random()*9000)}`] : [],
    socials: shuffle(allSocials).slice(0, numSocial),
  };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}