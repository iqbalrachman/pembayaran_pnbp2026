/**
 * ═══════════════════════════════════════════════════════════
 *  PNBP BMKG Dashboard — app.js
 *  Menggunakan fetch() ke Apps Script Web App (CORS-friendly)
 * ═══════════════════════════════════════════════════════════
 */

/* ── State ───────────────────────────────────────────────── */
let rawData     = [];
let activeData  = [];
let currentFilter = 'Month';
let charts      = {};
window.pages    = {};

/* ── Loader helpers ──────────────────────────────────────── */
const loader    = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderMsg = document.getElementById('loader-msg');

function setProgress(pct, msg) {
  loaderBar.style.width = pct + '%';
  if (msg) loaderMsg.textContent = msg;
}
function hideLoader() {
  loader.classList.add('hidden');
  setTimeout(() => loader.style.display = 'none', 400);
}

/* ── Format helpers ──────────────────────────────────────── */
function cleanNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = v.toString().replace(/\s/g, '');
  const n = Number(s.replace(/[^0-9eE.+-]/g, ''));
  return isNaN(n) ? 0 : n;
}
const fmtIDR = n => {
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(2) + ' M';
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(2) + ' Jt';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
};
const fmtUSD = n => {
  if (n >= 1e9) return '$ ' + (n / 1e9).toFixed(2) + ' B';
  if (n >= 1e6) return '$ ' + (n / 1e6).toFixed(2) + ' M';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};
const fmtNum  = n => new Intl.NumberFormat('id-ID').format(n);
const safeLog = v => Math.max(1, v);
const fmtExp  = v => (v <= 1) ? '0' : Number(v).toExponential(1);

function groupDate(str, mode) {
  if (!str) return 'Unknown';
  const d = new Date(str);
  if (isNaN(d)) return str;
  if (mode === 'Day')   return d.toISOString().slice(0, 10);
  if (mode === 'Month') return d.toISOString().slice(0, 7);
  if (mode === 'Year')  return String(d.getFullYear());
  return str;
}

/* ── ECharts base options ────────────────────────────────── */
const baseGrid = { top: '8%', left: '8%', right: '4%', bottom: '14%', containLabel: true };
const palette  = ['#0000CD', '#228B22', '#B45309', '#6366F1', '#EC4899'];

function baseTooltip() {
  return { trigger: 'axis', backgroundColor: '#fff', borderColor: '#E2E8F0', borderWidth: 1, textStyle: { color: '#0F172A', fontSize: 12 } };
}

/* ── Outlier detection ───────────────────────────────────── */
function detectOutliers(arr) {
  if (!arr.length) return [];
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std  = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  return arr.filter(v => v > mean + 3 * std);
}

/* ── Pagination ──────────────────────────────────────────── */
class Pager {
  constructor(tbodyId, pagerId, data, rowFn, size = 8) {
    this.tbody  = document.getElementById(tbodyId);
    this.pager  = document.getElementById(pagerId);
    this.data   = data;
    this.rowFn  = rowFn;
    this.size   = size;
    this.page   = 1;
    this.total  = Math.max(1, Math.ceil(data.length / size));
    window.pages[tbodyId] = this;
    this.render();
  }
  render() {
    this.tbody.innerHTML = '';
    if (!this.data.length) {
      this.tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:#94A3B8">Tidak ada data</td></tr>`;
      if (this.pager) this.pager.innerHTML = '';
      return;
    }
    const start = (this.page - 1) * this.size;
    this.data.slice(start, start + this.size).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = this.rowFn(row);
      this.tbody.appendChild(tr);
    });
    if (this.pager) this.renderPager();
  }
  renderPager() {
    let btns = '';
    for (let i = 1; i <= this.total; i++) {
      if (i === 1 || i === this.total || Math.abs(i - this.page) <= 1)
        btns += `<button class="${i === this.page ? 'active' : ''}" onclick="window.pages['${this.tbody.id}'].go(${i})">${i}</button>`;
      else if (Math.abs(i - this.page) === 2)
        btns += `<span style="color:#94A3B8;padding:0 2px">…</span>`;
    }
    this.pager.innerHTML = `
      <span>${this.data.length} data</span>
      <div style="display:flex;align-items:center;gap:3px">
        <button ${this.page===1?'disabled':''} onclick="window.pages['${this.tbody.id}'].go(${this.page-1})">‹</button>
        ${btns}
        <button ${this.page===this.total?'disabled':''} onclick="window.pages['${this.tbody.id}'].go(${this.page+1})">›</button>
      </div>`;
  }
  go(p) { this.page = Math.min(Math.max(1, p), this.total); this.render(); }
}

/* ══════════════════════════════════════════════════════════
   MOCK DATA — dipakai jika fetch() gagal
══════════════════════════════════════════════════════════ */
const MOCK = [
  { "NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-01-07","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"420283.45","VOLUME":"10507086.25","MATA UANG":"USD","KETERANGAN":"PNBP BMKG USD Okt 2025" },
  { "NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-01-15","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"482234.67","VOLUME":"12055866.75","MATA UANG":"USD","KETERANGAN":"PNBP USD November 2025" },
  { "NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-02-13","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"459760.23","VOLUME":"11494005.75","MATA UANG":"USD","KETERANGAN":"PNBP BMKG USD DES 2025" },
  { "NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-02-27","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"536027.37","VOLUME":"13400684.25","MATA UANG":"USD","KETERANGAN":"PNBP BMKG USD JAN 2026" },
  { "NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-04-16","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"456874.12","VOLUME":"11421853","MATA UANG":"USD","KETERANGAN":"PNBP BMKG USD FEB 2026" },
  { "NAMA WAJIB BAYAR / SETOR":"Stasiun Meteorologi Balikpapan","TANGGAL BAYAR":"2026-01-01","KODE KL/UNIT/SATKER":"437174 - STASIUN METEOROLOGI SEPINGGAN","NTPN":"Informasi Tabular Maritim","KODE AKUN":"425433","SETORAN PER AKUN":"700000","VOLUME":"2","MATA UANG":"IDR","KETERANGAN":"CV FAJAR NUR JAYA NOV-DES 2025" },
  { "NAMA WAJIB BAYAR / SETOR":"Stasiun Klimatologi Lampung","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"663839 - STASIUN KLIMATOLOGI LAMPUNG","NTPN":"Informasi Meteorologi Khusus","KODE AKUN":"425433","SETORAN PER AKUN":"3750000","VOLUME":"1","MATA UANG":"IDR","KETERANGAN":"CV Satria Jaya Mandiri" },
  { "NAMA WAJIB BAYAR / SETOR":"PT. TRANS YEONG MARITIME","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"663818 - STASIUN METEOROLOGI MARITIM KENDARI","NTPN":"Informasi Cuaca Untuk Pelabuhan","KODE AKUN":"425433","SETORAN PER AKUN":"1575000","VOLUME":"7","MATA UANG":"IDR","KETERANGAN":"PT. TRANS YEONG MARITIME" },
  { "NAMA WAJIB BAYAR / SETOR":"PT. INDOJAYAAGRINUSA","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"436936 - STASIUN METEOROLOGI SULTAN ISKANDAR MUDA","NTPN":"Informasi Meteorologi (asuransi)","KODE AKUN":"425433","SETORAN PER AKUN":"1050000","VOLUME":"6","MATA UANG":"IDR","KETERANGAN":"Klaim Asuransi 6 lokasi" },
  { "NAMA WAJIB BAYAR / SETOR":"Bustan, S.Si, M.Sc","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"663843 - STASIUN KLIMATOLOGI NUSA TENGGARA BARAT","NTPN":"Informasi Meteorologi Khusus","KODE AKUN":"425433","SETORAN PER AKUN":"3750000","VOLUME":"1","MATA UANG":"IDR","KETERANGAN":"" },
];

/* ══════════════════════════════════════════════════════════
   FETCH DATA
══════════════════════════════════════════════════════════ */
async function fetchData() {
  setProgress(10, 'Menghubungkan ke server...');

  try {
    const url = CONFIG.APPS_SCRIPT_URL + '?callback=_cb&t=' + Date.now();
    const res  = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'GET' });

    setProgress(50, 'Menerima data...');

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('Data kosong');

    setProgress(80, 'Memproses data...');
    setConnStatus('live', 'Live · SIMPONI-V2');
    return data;

  } catch (err) {
    console.warn('[PNBP] Fetch gagal, pakai mock data:', err.message);
    setProgress(80, 'Mode preview (data contoh)...');
    setConnStatus('mock', 'Preview Mode');
    return MOCK;
  }
}

function setConnStatus(mode, label) {
  const dot   = document.getElementById('conn-dot');
  const lbl   = document.getElementById('conn-label');
  dot.className = 'conn-dot ' + mode;
  lbl.textContent = label;
}

/* ══════════════════════════════════════════════════════════
   INIT ECHARTS
══════════════════════════════════════════════════════════ */
function initCharts() {
  const ids = ['cht-trend','cht-bar','cht-pie','cht-perf','cht-kl','cht-ntpn','cht-wajib'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) charts[id] = echarts.init(el);
  });
  window.addEventListener('resize', () => Object.values(charts).forEach(c => c && c.resize()));
}

/* ══════════════════════════════════════════════════════════
   RENDER DASHBOARD
══════════════════════════════════════════════════════════ */
function render(data) {
  if (!data || !data.length) return;

  const ds = data.map(r => ({
    ...r,
    _rev:  cleanNum(r['SETORAN PER AKUN']),
    _vol:  cleanNum(r['VOLUME']),
    _date: groupDate(r['TANGGAL BAYAR'], currentFilter),
    _curr: (r['MATA UANG'] || 'IDR').toUpperCase(),
  }));

  /* ── KPI totals ──────────────────────────────────────── */
  const idrRows = ds.filter(r => r._curr === 'IDR');
  const usdRows = ds.filter(r => r._curr === 'USD');
  const totIDR  = idrRows.reduce((s, r) => s + r._rev, 0);
  const totUSD  = usdRows.reduce((s, r) => s + r._rev, 0);
  const totVol  = ds.reduce((s, r) => s + r._vol, 0);
  const avgTx   = ds.length ? (totIDR + totUSD) / ds.length : 0;
  const ents    = new Set(ds.map(r => r['NAMA WAJIB BAYAR / SETOR'])).size;

  set('h-idr', fmtIDR(totIDR));
  set('h-idr-sub', fmtNum(idrRows.length) + ' transaksi IDR');
  set('h-usd', fmtUSD(totUSD));
  set('h-usd-sub', fmtNum(usdRows.length) + ' transaksi USD');
  set('kv-tx',  fmtNum(ds.length));
  set('kv-vol', fmtNum(Math.round(totVol)));
  set('kv-avg', fmtIDR(avgTx));
  set('kv-ent', fmtNum(ents));

  /* ── Date / entity / akun maps ───────────────────────── */
  const dateMap   = {};
  const entityMap = {};
  const akunMap   = {};

  ds.forEach(r => {
    const d = r._date, e = r['NAMA WAJIB BAYAR / SETOR'] || 'Unknown', a = r['KODE AKUN'] || '?';
    if (!dateMap[d])   dateMap[d]   = { rev: 0, vol: 0 };
    if (!entityMap[e]) entityMap[e] = { idr: 0, usd: 0, tot: 0, tx: 0 };
    if (!akunMap[a])   akunMap[a]   = 0;

    dateMap[d].rev += r._rev;
    dateMap[d].vol += r._vol;
    if (r._curr === 'USD') entityMap[e].usd += r._rev;
    else                   entityMap[e].idr += r._rev;
    entityMap[e].tot += r._rev;
    entityMap[e].tx  += 1;
    akunMap[a] += r._rev;
  });

  const dates = Object.keys(dateMap).sort();
  const entArr = Object.entries(entityMap).sort((a, b) => b[1].tot - a[1].tot);

  /* ── Top entity ──────────────────────────────────────── */
  if (entArr.length) {
    const [name, v] = entArr[0];
    set('top-name', name);
    set('top-desc', v.tx + ' transaksi · ' + (v.usd > 0 ? 'USD' : 'IDR'));
    set('top-val',  v.usd > 0 ? fmtUSD(v.usd) : fmtIDR(v.idr));
    set('top-cnt',  fmtNum(v.tx));
  }

  /* ── Trend chart ─────────────────────────────────────── */
  charts['cht-trend'] && charts['cht-trend'].setOption({
    tooltip: baseTooltip(),
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: baseGrid,
    xAxis: { type: 'category', boundaryGap: false, data: dates },
    yAxis: [
      { type: 'log', logBase: 10, axisLabel: { formatter: fmtExp }, splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } } },
      { type: 'log', logBase: 10, show: false },
    ],
    color: palette,
    series: [
      { name: 'Revenue', type: 'line', data: dates.map(d => safeLog(dateMap[d].rev)), areaStyle: { opacity: .15 }, smooth: false, symbol: 'circle', symbolSize: 5 },
      { name: 'Volume',  type: 'line', data: dates.map(d => safeLog(dateMap[d].vol)), yAxisIndex: 1, areaStyle: { opacity: .1 }, smooth: false, symbol: 'circle', symbolSize: 5 },
    ],
  });

  /* ── Bar chart (top entities) ────────────────────────── */
  const top8 = entArr.slice(0, 8);
  charts['cht-bar'] && charts['cht-bar'].setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { ...baseGrid, bottom: '20%' },
    xAxis: { type: 'category', data: top8.map(e => e[0].slice(0, 12) + '…'), axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } } },
    color: [palette[1]],
    series: [{ name: 'Revenue', type: 'bar', data: top8.map(e => e[1].tot), itemStyle: { borderRadius: [5, 5, 0, 0] } }],
  });

  /* ── Pie (akun) ──────────────────────────────────────── */
  charts['cht-pie'] && charts['cht-pie'].setOption({
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} ({d}%)' },
    legend: { bottom: 0, textStyle: { fontSize: 10 } },
    color: palette,
    series: [{ type: 'pie', radius: ['40%', '68%'],
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
      label: { show: false }, emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
      data: Object.entries(akunMap).map(([k, v]) => ({ name: 'Akun ' + k, value: v }))
    }],
  });

  /* ── Perf line (log) ─────────────────────────────────── */
  charts['cht-perf'] && charts['cht-perf'].setOption({
    tooltip: baseTooltip(),
    grid: baseGrid,
    xAxis: { type: 'category', boundaryGap: false, data: dates },
    yAxis: { type: 'log', logBase: 10, axisLabel: { formatter: fmtExp }, splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } } },
    color: ['#94A3B8'],
    series: [{ type: 'line', data: dates.map(d => safeLog(dateMap[d].rev * 1.05)), smooth: false, lineStyle: { type: 'dashed', width: 2 }, symbol: 'none' }],
  });

  /* ── Recent transactions table ───────────────────────── */
  const tbody = document.getElementById('tbl-body');
  tbody.innerHTML = '';
  const filter = document.getElementById('tbl-filter').value;
  const shown  = ds.filter(r => filter === 'all' || r._curr === filter).slice(0, 15);
  shown.forEach(r => {
    const isUSD = r._curr === 'USD';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td title="${esc(r['NAMA WAJIB BAYAR / SETOR'])}">${esc(r['NAMA WAJIB BAYAR / SETOR'])}</td>
      <td>${esc(r['TANGGAL BAYAR'])}</td>
      <td title="${esc(r['NTPN'])}" style="font-size:.72rem">${esc(r['NTPN'])}</td>
      <td><span class="badge-akun">${esc(r['KODE AKUN'])}</span></td>
      <td title="${esc(r['KETERANGAN'])}" style="color:#94A3B8;font-size:.72rem">${esc(r['KETERANGAN'] || '—')}</td>
      <td class="tr ${isUSD ? 'rev-usd' : 'rev-idr'}">${isUSD ? fmtUSD(r._rev) : fmtIDR(r._rev)}</td>`;
    tbody.appendChild(tr);
  });

  /* ── Advanced sections ───────────────────────────────── */
  renderKL(ds, dates);
  renderNTPN(ds);
  renderWajib(ds);
}

/* ── KL/Satker section ───────────────────────────────────── */
function renderKL(ds, globalDates) {
  const m = {};
  ds.forEach(r => {
    const k = r['KODE KL/UNIT/SATKER'] || 'Unknown';
    if (!m[k]) m[k] = { idr: 0, usd: 0, tx: 0, byDate: {} };
    if (r._curr === 'USD') m[k].usd += r._rev; else m[k].idr += r._rev;
    m[k].tx += 1;
    m[k].byDate[r._date] = (m[k].byDate[r._date] || 0) + r._rev;
  });
  const arr = Object.entries(m).map(([k, v]) => ({ id: k, ...v, tot: v.idr + v.usd })).sort((a, b) => b.tot - a.tot);

  set('kl-k1', fmtNum(arr.length));
  set('kl-k2', fmtIDR(arr.length ? arr.reduce((s, a) => s + a.idr, 0) / arr.length : 0));
  set('kl-k3', arr[0]?.id || '—');

  const top5 = arr.slice(0, 5);
  charts['cht-kl'] && charts['cht-kl'].setOption({
    tooltip: baseTooltip(),
    legend: { data: top5.map(p => p.id.slice(0, 12) + '…'), top: 0, textStyle: { fontSize: 10 } },
    grid: { ...baseGrid, top: '18%' },
    xAxis: { type: 'category', boundaryGap: false, data: globalDates },
    yAxis: { type: 'log', logBase: 10, axisLabel: { formatter: fmtExp }, splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } } },
    color: palette,
    series: top5.map(p => ({
      name: p.id.slice(0, 12) + '…', type: 'line', smooth: false,
      data: globalDates.map(d => safeLog(p.byDate[d] || 0)),
      markPoint: { data: [{ type: 'max', name: 'Max' }] },
    })),
  });

  new Pager('tbl-kl', 'pg-kl', arr, r => `
    <td title="${esc(r.id)}">${esc(r.id)}</td>
    <td>${fmtNum(r.tx)}</td>
    <td class="tr">
      ${r.idr > 0 ? `<span class="rev-idr">${fmtIDR(r.idr)}</span>` : ''}
      ${r.idr > 0 && r.usd > 0 ? '<br>' : ''}
      ${r.usd > 0 ? `<span class="rev-usd">${fmtUSD(r.usd)}</span>` : ''}
      ${r.idr === 0 && r.usd === 0 ? 'Rp 0' : ''}
    </td>`);
}

/* ── NTPN section ────────────────────────────────────────── */
function renderNTPN(ds) {
  const m = {};
  ds.forEach(r => {
    const k = r['NTPN'] || 'Unknown';
    if (!m[k]) m[k] = { idr: 0, usd: 0, tx: 0 };
    if (r._curr === 'USD') m[k].usd += r._rev; else m[k].idr += r._rev;
    m[k].tx += 1;
  });
  const arr = Object.entries(m).map(([k, v]) => ({ id: k, ...v, tot: v.idr + v.usd })).sort((a, b) => b.tot - a.tot);
  const outliers = detectOutliers(ds.map(r => r._rev));

  set('nt-k1', fmtNum(arr.length));
  set('nt-k2', arr[0]?.id || '—');
  set('nt-k3', fmtNum(outliers.length));

  const top10 = arr.slice(0, 10);
  charts['cht-ntpn'] && charts['cht-ntpn'].setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['IDR', 'USD'], top: 0 },
    grid: { ...baseGrid, top: '14%', bottom: '22%' },
    xAxis: { type: 'category', data: top10.map(k => k.id.slice(0, 10) + '…'), axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } } },
    color: [palette[0], palette[1]],
    series: [
      { name: 'IDR', type: 'bar', data: top10.map(k => k.idr), itemStyle: { borderRadius: [4, 4, 0, 0] } },
      { name: 'USD', type: 'bar', data: top10.map(k => k.usd), itemStyle: { borderRadius: [4, 4, 0, 0] } },
    ],
  });

  new Pager('tbl-ntpn', 'pg-ntpn', arr, r => `
    <td title="${esc(r.id)}">${esc(r.id)}</td>
    <td>${fmtNum(r.tx)}</td>
    <td class="tr">
      ${r.idr > 0 ? `<span class="rev-idr">${fmtIDR(r.idr)}</span>` : ''}
      ${r.idr > 0 && r.usd > 0 ? '<br>' : ''}
      ${r.usd > 0 ? `<span class="rev-usd">${fmtUSD(r.usd)}</span>` : ''}
    </td>`);
}

/* ── Wajib Bayar section ─────────────────────────────────── */
function renderWajib(ds) {
  const m = {};
  ds.forEach(r => {
    const k = r['NAMA WAJIB BAYAR / SETOR'] || 'Unknown';
    if (!m[k]) m[k] = { idr: 0, usd: 0, tx: 0 };
    if (r._curr === 'USD') m[k].usd += r._rev; else m[k].idr += r._rev;
    m[k].tx += 1;
  });
  const arr = Object.entries(m).map(([k, v]) => ({ id: k, ...v, tot: v.idr + v.usd })).sort((a, b) => b.tot - a.tot);

  set('wb-k1', fmtNum(arr.length));
  set('wb-k2', arr[0]?.id || '—');

  const top7 = arr.slice(0, 7);
  const rest  = arr.slice(7).reduce((s, r) => s + r.tot, 0);
  const pieD  = [...top7.map(e => ({ name: e.id, value: e.tot }))];
  if (rest > 0) pieD.push({ name: 'Lainnya', value: rest });

  charts['cht-wajib'] && charts['cht-wajib'].setOption({
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20, textStyle: { fontSize: 10 } },
    color: palette.concat(['#64748B', '#D4A017', '#6B7280']),
    series: [{ name: 'Segmen', type: 'pie', radius: ['38%', '66%'], center: ['38%', '50%'],
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\n{d}%', fontSize: 10 },
      data: pieD,
    }],
  });

  new Pager('tbl-wajib', 'pg-wajib', arr, r => `
    <td title="${esc(r.id)}">${esc(r.id)}</td>
    <td>${fmtNum(r.tx)}</td>
    <td class="tr">
      ${r.idr > 0 ? `<span class="rev-idr">${fmtIDR(r.idr)}</span>` : ''}
      ${r.idr > 0 && r.usd > 0 ? '<br>' : ''}
      ${r.usd > 0 ? `<span class="rev-usd">${fmtUSD(r.usd)}</span>` : ''}
    </td>`);
}

/* ── Helpers ─────────────────────────────────────────────── */
function set(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Sidebar toggle ──────────────────────────────────────── */
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  setTimeout(() => Object.values(charts).forEach(c => c && c.resize()), 310);
});

/* ── Nav links scroll ────────────────────────────────────── */
document.querySelectorAll('.nav-link').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const id = a.getAttribute('data-target');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ── Scroll spy ──────────────────────────────────────────── */
const spy = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const a = document.querySelector(`.nav-link[data-target="${en.target.id}"]`);
      if (a) a.classList.add('active');
    }
  });
}, { root: document.getElementById('main-scroll'), rootMargin: '0px 0px -60% 0px', threshold: .1 });

['sec-overview','sec-kl','sec-ntpn','sec-wajib'].forEach(id => {
  const el = document.getElementById(id);
  if (el) spy.observe(el);
});

/* ── Search ──────────────────────────────────────────────── */
document.getElementById('global-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  activeData = q ? rawData.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))) : [...rawData];
  render(activeData);
});

/* ── Date filter tabs ────────────────────────────────────── */
document.querySelectorAll('.ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-f');
    render(activeData);
  });
});

/* ── Currency filter ─────────────────────────────────────── */
document.getElementById('tbl-filter').addEventListener('change', () => render(activeData));

/* ── Export CSV ──────────────────────────────────────────── */
function exportCSV() {
  if (!activeData.length) return;
  const keys = Object.keys(activeData[0]);
  const rows = [keys, ...activeData.map(r => keys.map(k => '"' + String(r[k] || '').replace(/"/g, '""') + '"'))];
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pnbp_bmkg_' + Date.now() + '.csv';
  a.click();
}
document.getElementById('export-btn').addEventListener('click', exportCSV);
document.getElementById('export-btn2').addEventListener('click', exportCSV);

/* ── Apply config labels ─────────────────────────────────── */
function applyConfig() {
  if (typeof CONFIG === 'undefined') return;
  document.title = CONFIG.APP_TITLE || document.title;
  set('topbar-title', CONFIG.APP_TITLE || '');
  set('topbar-sub',   CONFIG.APP_SUBTITLE || '');
  set('foot-unit',    CONFIG.UNIT_LABEL || '');
  set('foot-src',     CONFIG.SOURCE_LABEL || '');
}

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  applyConfig();
  initCharts();
  setProgress(5, 'Memuat konfigurasi...');

  rawData    = await fetchData();
  activeData = [...rawData];

  setProgress(95, 'Merender dashboard...');
  render(activeData);

  setProgress(100, 'Selesai!');
  setTimeout(hideLoader, 400);
});
