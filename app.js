/**
 * ═══════════════════════════════════════════════════════════
 *  PNBP BMKG Dashboard — app.js (SECURE & RELIABLE VERSION)
 *  - Fixed connectivity issues
 *  - Enhanced error handling & logging
 *  - Security improvements (XSS protection, timeout, CORS)
 * ═══════════════════════════════════════════════════════════
 */

/* ── Global State ───────────────────────────────────────── */
let rawData = [];
let activeData = [];
let currentFilter = 'Month';
let charts = {};
window.pages = {};
let loader, loaderBar, loaderMsg;

/* ── Constants ──────────────────────────────────────────── */
const FETCH_TIMEOUT = 15000; // 15 seconds
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000; // 2 seconds between retries
const LOG_PREFIX = '[PNBP-DASHBOARD]';

/* ── Error Logging System ───────────────────────────────── */
const ErrorLogger = {
  logs: [],
  maxLogs: 50,

  log(level, context, error, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: error?.message || String(error),
      stack: error?.stack,
      ...details
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output
    const prefix = `${LOG_PREFIX} [${level}]`;
    if (level === 'ERROR') {
      console.error(prefix, context, entry);
    } else if (level === 'WARN') {
      console.warn(prefix, context, entry);
    } else {
      console.log(prefix, context, entry);
    }
  },

  error(context, error, details) {
    this.log('ERROR', context, error, details);
  },

  warn(context, message, details) {
    this.log('WARN', context, new Error(message), details);
  },

  info(context, message, details) {
    this.log('INFO', context, new Error(message), details);
  },

  getLogs() {
    return this.logs;
  }
};

/* ── Initialize Loader ──────────────────────────────────── */
function initLoader() {
  loader = document.getElementById('loader');
  loaderBar = document.getElementById('loader-bar');
  loaderMsg = document.getElementById('loader-msg');
}

function setProgress(pct, msg) {
  if (loaderBar) {
    loaderBar.style.width = Math.min(100, pct) + '%';
  }
  if (loaderMsg && msg) {
    loaderMsg.textContent = msg;
  }
}

function hideLoader() {
  if (!loader) return;
  loader.classList.add('hidden');
  setTimeout(() => {
    if (loader) loader.style.display = 'none';
  }, 400);
}

/* ── Format Helpers ────────────────────────────────────── */
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

const fmtNum = n => new Intl.NumberFormat('id-ID').format(n);
const safeLog = v => Math.max(1, v);
const fmtExp = v => (v <= 1) ? '0' : Number(v).toExponential(1);

function groupDate(str, mode) {
  if (!str) return 'Unknown';
  const d = new Date(str);
  if (isNaN(d)) return str;
  if (mode === 'Day') return d.toISOString().slice(0, 10);
  if (mode === 'Month') return d.toISOString().slice(0, 7);
  if (mode === 'Year') return String(d.getFullYear());
  return str;
}

/* ── HTML Sanitization (XSS Prevention) ──────────────────– */
function sanitizeHTML(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(str || '').replace(/[&<>"']/g, char => map[char]);
}

function setTextContent(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = text;
  }
}

/* ── ECharts Configuration ──────────────────────────────– */
const baseGrid = { top: '8%', left: '8%', right: '4%', bottom: '14%', containLabel: true };
const palette = ['#0000CD', '#228B22', '#B45309', '#6366F1', '#EC4899'];

function baseTooltip() {
  return {
    trigger: 'axis',
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    textStyle: { color: '#0F172A', fontSize: 12 }
  };
}

/* ── Outlier Detection ──────────────────────────────────– */
function detectOutliers(arr) {
  if (!arr.length) return [];
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  return arr.filter(v => v > mean + 3 * std);
}

/* ── Pagination Class ──────────────────────────────────– */
class Pager {
  constructor(tbodyId, pagerId, data, rowFn, size = 8) {
    this.tbody = document.getElementById(tbodyId);
    this.pager = document.getElementById(pagerId);
    this.data = data;
    this.rowFn = rowFn;
    this.size = size;
    this.page = 1;
    this.total = Math.max(1, Math.ceil(data.length / size));
    window.pages[tbodyId] = this;

    if (!this.tbody) {
      ErrorLogger.warn('Pager', `tbody element ${tbodyId} tidak ditemukan`);
      return;
    }

    this.render();
  }

  render() {
    if (!this.tbody) return;

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
      if (i === 1 || i === this.total || Math.abs(i - this.page) <= 1) {
        btns += `<button class="${i === this.page ? 'active' : ''}" onclick="window.pages['${this.tbody.id}'].go(${i})">${i}</button>`;
      } else if (Math.abs(i - this.page) === 2) {
        btns += `<span style="color:#94A3B8;padding:0 2px">…</span>`;
      }
    }

    this.pager.innerHTML = `
      <span>${this.data.length} data</span>
      <div style="display:flex;align-items:center;gap:3px">
        <button ${this.page === 1 ? 'disabled' : ''} onclick="window.pages['${this.tbody.id}'].go(${this.page - 1})">‹</button>
        ${btns}
        <button ${this.page === this.total ? 'disabled' : ''} onclick="window.pages['${this.tbody.id}'].go(${this.page + 1})">›</button>
      </div>`;
  }

  go(p) {
    this.page = Math.min(Math.max(1, p), this.total);
    this.render();
  }
}

/* ══════════════════════════════════════════════════════════
   MOCK DATA (Complete with all required fields)
══════════════════════════════════════════════════════════ */
const MOCK = [
  {"NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-01-07","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"50000000","VOLUME":"1","MATA UANG":"IDR","KETERANGAN":"Pembayaran Januari"},
  {"NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-01-15","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"75000000","VOLUME":"2","MATA UANG":"USD","KETERANGAN":"Pembayaran Januari Tambahan"},
  {"NAMA WAJIB BAYAR / SETOR":"Stasiun Meteorologi Balikpapan","TANGGAL BAYAR":"2026-01-01","KODE KL/UNIT/SATKER":"437174 - STASIUN METEOROLOGI SEPINGGAN","NTPN":"Informasi Tabular Maritim","KODE AKUN":"425434","SETORAN PER AKUN":"25000000","VOLUME":"1","MATA UANG":"IDR","KETERANGAN":""},
  {"NAMA WAJIB BAYAR / SETOR":"Stasiun Klimatologi Lampung","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"663839 - STASIUN KLIMATOLOGI LAMPUNG","NTPN":"Informasi Meteorologi Khusus","KODE AKUN":"425435","SETORAN PER AKUN":"30000000","VOLUME":"1","MATA UANG":"IDR","KETERANGAN":"Data khusus"},
  {"NAMA WAJIB BAYAR / SETOR":"PT. TRANS YEONG MARITIME","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"663818 - STASIUN METEOROLOGI MARITIM KENDARI","NTPN":"Informasi Cuaca Untuk Pelabuhan","KODE AKUN":"425436","SETORAN PER AKUN":"15000000","VOLUME":"1","MATA UANG":"IDR","KETERANGAN":""},
  {"NAMA WAJIB BAYAR / SETOR":"PT. INDOJAYAAGRINUSA","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"436936 - STASIUN METEOROLOGI SULTAN ISKANDAR MUDA","NTPN":"Informasi Meteorologi","KODE AKUN":"425437","SETORAN PER AKUN":"45000000","VOLUME":"3","MATA UANG":"IDR","KETERANGAN":""},
  {"NAMA WAJIB BAYAR / SETOR":"Bustan, S.Si, M.Sc","TANGGAL BAYAR":"2026-01-02","KODE KL/UNIT/SATKER":"663843 - STASIUN KLIMATOLOGI NTB","NTPN":"Informasi Meteorologi Khusus","KODE AKUN":"425438","SETORAN PER AKUN":"20000000","VOLUME":"1","MATA UANG":"IDR","KETERANGAN":"Pembayaran khusus"},
  {"NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-02-13","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"60000000","VOLUME":"2","MATA UANG":"IDR","KETERANGAN":"Pembayaran Februari"},
  {"NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-02-27","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"55000000","VOLUME":"1","MATA UANG":"USD","KETERANGAN":"Pembayaran Februari Tambahan"},
  {"NAMA WAJIB BAYAR / SETOR":"PERUM LPPNPI","TANGGAL BAYAR":"2026-04-16","KODE KL/UNIT/SATKER":"436766 - SEKRETARIAT UTAMA BMKG","NTPN":"Informasi Cuaca untuk Penerbangan","KODE AKUN":"425433","SETORAN PER AKUN":"80000000","VOLUME":"2","MATA UANG":"IDR","KETERANGAN":"Pembayaran April"}
];

/* ══════════════════════════════════════════════════════════
   FETCH DATA WITH RETRY & TIMEOUT
══════════════════════════════════════════════════════════ */
async function fetchData(attempt = 1) {
  if (typeof CONFIG === 'undefined') {
    ErrorLogger.warn('fetchData', 'CONFIG tidak terdefinisi');
    setProgress(80, 'Mode preview (data contoh)...');
    setConnStatus('mock', 'Preview Mode');
    return MOCK;
  }

  if (!CONFIG.APPS_SCRIPT_URL) {
    ErrorLogger.warn('fetchData', 'APPS_SCRIPT_URL kosong');
    setProgress(80, 'Mode preview (data contoh)...');
    setConnStatus('mock', 'Preview Mode');
    return MOCK;
  }

  setProgress(10 + attempt * 5, `Menghubungkan (attempt ${attempt}/${RETRY_ATTEMPTS})...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const url = CONFIG.APPS_SCRIPT_URL + (CONFIG.APPS_SCRIPT_URL.includes('?') ? '&' : '?') + 't=' + Date.now();

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeoutId);
    setProgress(50, 'Menerima data...');

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('Data kosong');

    setProgress(80, 'Memproses data...');
    setConnStatus('live', 'Live · SIMPONI-V2');

    ErrorLogger.info('fetchData', `✓ ${data.length} records`);
    return data;

  } catch (err) {
    clearTimeout(timeoutId);

    ErrorLogger.error('fetchData', err, { attempt });

    if (attempt < RETRY_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchData(attempt + 1);
    }

    setProgress(80, 'Mode preview (data contoh)...');
    setConnStatus('mock', 'Preview Mode');
    return MOCK;
  }
}

function setConnStatus(mode, label) {
  const dot = document.getElementById('conn-dot');
  const lbl = document.getElementById('conn-label');

  if (dot) dot.className = 'conn-dot ' + mode;
  if (lbl) lbl.textContent = label;
}

/* ══════════════════════════════════════════════════════════
   INIT CHARTS
══════════════════════════════════════════════════════════ */
function initCharts() {
  if (typeof echarts === 'undefined') {
    ErrorLogger.error('initCharts', new Error('ECharts not loaded'));
    return;
  }

  const ids = ['cht-trend', 'cht-bar', 'cht-pie', 'cht-perf', 'cht-kl', 'cht-ntpn', 'cht-wajib'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) charts[id] = echarts.init(el);
  });

  window.addEventListener('resize', () => {
    Object.values(charts).forEach(c => c && c.resize());
  });
}

/* ══════════════════════════════════════════════════════════
   RENDER DASHBOARD
══════════════════════════════════════════════════════════ */
function render(data) {
  if (!data || !data.length) return;

  try {
    const ds = data.map(r => ({
      ...r,
      _rev: cleanNum(r['SETORAN PER AKUN']),
      _vol: cleanNum(r['VOLUME']),
      _date: groupDate(r['TANGGAL BAYAR'], currentFilter),
      _curr: (r['MATA UANG'] || 'IDR').toUpperCase()
    }));

    const idrRows = ds.filter(r => r._curr === 'IDR');
    const usdRows = ds.filter(r => r._curr === 'USD');
    const totIDR = idrRows.reduce((s, r) => s + r._rev, 0);
    const totUSD = usdRows.reduce((s, r) => s + r._rev, 0);
    const totVol = ds.reduce((s, r) => s + r._vol, 0);
    const avgTx = ds.length ? (totIDR + totUSD) / ds.length : 0;
    const ents = new Set(ds.map(r => r['NAMA WAJIB BAYAR / SETOR'])).size;

    setTextContent('h-idr', fmtIDR(totIDR));
    setTextContent('h-idr-sub', fmtNum(idrRows.length) + ' transaksi IDR');
    setTextContent('h-usd', fmtUSD(totUSD));
    setTextContent('h-usd-sub', fmtNum(usdRows.length) + ' transaksi USD');
    setTextContent('kv-tx', fmtNum(ds.length));
    setTextContent('kv-vol', fmtNum(Math.round(totVol)));
    setTextContent('kv-avg', fmtIDR(avgTx));
    setTextContent('kv-ent', fmtNum(ents));

    const dateMap = {};
    const entityMap = {};
    const akunMap = {};

    ds.forEach(r => {
      const d = r._date;
      const e = r['NAMA WAJIB BAYAR / SETOR'] || 'Unknown';
      const a = r['KODE AKUN'] || '?';

      if (!dateMap[d]) dateMap[d] = { rev: 0, vol: 0 };
      if (!entityMap[e]) entityMap[e] = { idr: 0, usd: 0, tot: 0, tx: 0 };
      if (!akunMap[a]) akunMap[a] = 0;

      dateMap[d].rev += r._rev;
      dateMap[d].vol += r._vol;

      if (r._curr === 'USD') entityMap[e].usd += r._rev;
      else entityMap[e].idr += r._rev;

      entityMap[e].tot += r._rev;
      entityMap[e].tx += 1;
      akunMap[a] += r._rev;
    });

    const dates = Object.keys(dateMap).sort();
    const entArr = Object.entries(entityMap).sort((a, b) => b[1].tot - a[1].tot);

    if (entArr.length) {
      const [name, v] = entArr[0];
      setTextContent('top-name', name);
      setTextContent('top-desc', v.tx + ' transaksi · ' + (v.usd > 0 ? 'USD' : 'IDR'));
      setTextContent('top-val', v.usd > 0 ? fmtUSD(v.usd) : fmtIDR(v.idr));
      setTextContent('top-cnt', fmtNum(v.tx));
    }

    if (charts['cht-trend']) {
      charts['cht-trend'].setOption({
        tooltip: baseTooltip(),
        legend: { bottom: 0, textStyle: { fontSize: 11 } },
        grid: baseGrid,
        xAxis: { type: 'category', boundaryGap: false, data: dates },
        yAxis: [
          { type: 'log', logBase: 10, axisLabel: { formatter: fmtExp }, splitLine: { lineStyle: { type: 'dashed', color: '#F1F5F9' } } },
          { type: 'log', logBase: 10, show: false }
        ],
        color: palette,
        series: [
          { name: 'Revenue', type: 'line', data: dates.map(d => safeLog(dateMap[d].rev)), areaStyle: { opacity: 0.15 } },
          { name: 'Volume', type: 'line', data: dates.map(d => safeLog(dateMap[d].vol)), yAxisIndex: 1, areaStyle: { opacity: 0.1 } }
        ]
      });
    }

    const top8 = entArr.slice(0, 8);
    if (charts['cht-bar']) {
      charts['cht-bar'].setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { ...baseGrid, bottom: '20%' },
        xAxis: { type: 'category', data: top8.map(e => e[0].slice(0, 12) + '…') },
        yAxis: { type: 'value' },
        color: [palette[1]],
        series: [{ name: 'Revenue', type: 'bar', data: top8.map(e => e[1].tot) }]
      });
    }

    if (charts['cht-pie']) {
      charts['cht-pie'].setOption({
        tooltip: { trigger: 'item', formatter: '{b}<br/>{c} ({d}%)' },
        legend: { bottom: 0 },
        color: palette,
        series: [{ type: 'pie', radius: ['40%', '68%'], data: Object.entries(akunMap).map(([k, v]) => ({ name: 'Akun ' + k, value: v })) }]
      });
    }

    if (charts['cht-perf']) {
      charts['cht-perf'].setOption({
        tooltip: baseTooltip(),
        grid: baseGrid,
        xAxis: { type: 'category', boundaryGap: false, data: dates },
        yAxis: { type: 'log', logBase: 10 },
        color: ['#94A3B8'],
        series: [{ type: 'line', data: dates.map(d => safeLog(dateMap[d].rev * 1.05)) }]
      });
    }

    const tbody = document.getElementById('tbl-body');
    if (tbody) {
      tbody.innerHTML = '';
      const filter = document.getElementById('tbl-filter');
      const filterValue = filter ? filter.value : 'all';
      const shown = ds.filter(r => filterValue === 'all' || r._curr === filterValue).slice(0, 15);

      shown.forEach(r => {
        const isUSD = r._curr === 'USD';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${sanitizeHTML(r['NAMA WAJIB BAYAR / SETOR'])}</td>
          <td>${sanitizeHTML(r['TANGGAL BAYAR'])}</td>
          <td>${sanitizeHTML(r['NTPN'])}</td>
          <td>${sanitizeHTML(r['KODE AKUN'])}</td>
          <td>${sanitizeHTML(r['KETERANGAN'] || '—')}</td>
          <td>${isUSD ? fmtUSD(r._rev) : fmtIDR(r._rev)}</td>`;
        tbody.appendChild(tr);
      });
    }

    renderKL(ds, dates);
    renderNTPN(ds);
    renderWajib(ds);

  } catch (err) {
    ErrorLogger.error('render', err);
  }
}

function renderKL(ds, globalDates) {
  const m = {};
  ds.forEach(r => {
    const k = r['KODE KL/UNIT/SATKER'] || 'Unknown';
    if (!m[k]) m[k] = { idr: 0, usd: 0, tx: 0, byDate: {} };
    if (r._curr === 'USD') m[k].usd += r._rev;
    else m[k].idr += r._rev;
    m[k].tx += 1;
    m[k].byDate[r._date] = (m[k].byDate[r._date] || 0) + r._rev;
  });

  const arr = Object.entries(m).map(([k, v]) => ({ id: k, ...v, tot: v.idr + v.usd })).sort((a, b) => b.tot - a.tot);

  setTextContent('kl-k1', fmtNum(arr.length));
  setTextContent('kl-k2', fmtIDR(arr.length ? arr.reduce((s, a) => s + a.idr, 0) / arr.length : 0));
  setTextContent('kl-k3', arr[0]?.id || '—');

  const top5 = arr.slice(0, 5);
  if (charts['cht-kl']) {
    charts['cht-kl'].setOption({
      tooltip: baseTooltip(),
      legend: { data: top5.map(p => p.id.slice(0, 12) + '…') },
      grid: baseGrid,
      xAxis: { type: 'category', data: globalDates },
      yAxis: { type: 'log', logBase: 10 },
      series: top5.map(p => ({
        name: p.id.slice(0, 12) + '…',
        type: 'line',
        data: globalDates.map(d => safeLog(p.byDate[d] || 0))
      }))
    });
  }

  new Pager('tbl-kl', 'pg-kl', arr, r => `
    <td>${sanitizeHTML(r.id)}</td>
    <td>${fmtNum(r.tx)}</td>
    <td>${fmtIDR(r.idr)}${r.usd > 0 ? ' / ' + fmtUSD(r.usd) : ''}</td>`, 10);
}

function renderNTPN(ds) {
  const m = {};
  ds.forEach(r => {
    const k = r['NTPN'] || 'Unknown';
    if (!m[k]) m[k] = { idr: 0, usd: 0, tx: 0 };
    if (r._curr === 'USD') m[k].usd += r._rev;
    else m[k].idr += r._rev;
    m[k].tx += 1;
  });

  const arr = Object.entries(m).map(([k, v]) => ({ id: k, ...v, tot: v.idr + v.usd })).sort((a, b) => b.tot - a.tot);
  const outliers = detectOutliers(ds.map(r => r._rev));

  setTextContent('nt-k1', fmtNum(arr.length));
  setTextContent('nt-k2', arr[0]?.id || '—');
  setTextContent('nt-k3', fmtNum(outliers.length));

  new Pager('tbl-ntpn', 'pg-ntpn', arr, r => `
    <td>${sanitizeHTML(r.id)}</td>
    <td>${fmtNum(r.tx)}</td>
    <td>${fmtIDR(r.idr)}${r.usd > 0 ? ' / ' + fmtUSD(r.usd) : ''}</td>`, 10);
}

function renderWajib(ds) {
  const m = {};
  ds.forEach(r => {
    const k = r['NAMA WAJIB BAYAR / SETOR'] || 'Unknown';
    if (!m[k]) m[k] = { idr: 0, usd: 0, tx: 0 };
    if (r._curr === 'USD') m[k].usd += r._rev;
    else m[k].idr += r._rev;
    m[k].tx += 1;
  });

  const arr = Object.entries(m).map(([k, v]) => ({ id: k, ...v, tot: v.idr + v.usd })).sort((a, b) => b.tot - a.tot);

  setTextContent('wb-k1', fmtNum(arr.length));
  setTextContent('wb-k2', arr[0]?.id || '—');

  const top7 = arr.slice(0, 7);
  const rest = arr.slice(7).reduce((s, r) => s + r.tot, 0);
  const pieD = [...top7.map(e => ({ name: e.id, value: e.tot }))];
  if (rest > 0) pieD.push({ name: 'Lainnya', value: rest });

  if (charts['cht-wajib']) {
    charts['cht-wajib'].setOption({
      tooltip: { trigger: 'item', formatter: '{b}<br/>{c} ({d}%)' },
      legend: { type: 'scroll', orient: 'vertical', right: 10 },
      series: [{ type: 'pie', radius: ['38%', '66%'], data: pieD }]
    });
  }

  new Pager('tbl-wajib', 'pg-wajib', arr, r => `
    <td>${sanitizeHTML(r.id)}</td>
    <td>${fmtNum(r.tx)}</td>
    <td>${fmtIDR(r.idr)}${r.usd > 0 ? ' / ' + fmtUSD(r.usd) : ''}</td>`, 10);
}

/* ── Event Listeners ──────────────────────────────────– */
function setupEventListeners() {
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('collapsed');
      setTimeout(() => Object.values(charts).forEach(c => c && c.resize()), 310);
    });
  }

  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.getAttribute('data-target'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      activeData = q ? rawData.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))) : [...rawData];
      render(activeData);
    });
  }

  document.querySelectorAll('.ftab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-f');
      render(activeData);
    });
  });

  function exportCSV() {
    if (!activeData.length) {
      alert('Tidak ada data untuk di-export');
      return;
    }
    const keys = Object.keys(activeData[0]);
    const rows = [keys, ...activeData.map(r => keys.map(k => `"${String(r[k] || '').replace(/"/g, '""')}"`))];  const csv = rows.map(r => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'pnbp_bmkg_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
  }

  document.getElementById('export-btn')?.addEventListener('click', exportCSV);
  document.getElementById('export-btn2')?.addEventListener('click', exportCSV);
}

function applyConfig() {
  if (typeof CONFIG === 'undefined') return;
  document.title = CONFIG.APP_TITLE || 'PNBP';
  setTextContent('topbar-title', CONFIG.APP_TITLE || '');
  setTextContent('topbar-sub', CONFIG.APP_SUBTITLE || '');
}

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  initLoader();
  applyConfig();
  initCharts();
  setupEventListeners();

  setProgress(5, 'Memuat konfigurasi...');

  rawData = await fetchData();
  activeData = [...rawData];

  setProgress(95, 'Merender dashboard...');
  render(activeData);

  setProgress(100, 'Selesai!');
  setTimeout(hideLoader, 400);

  window.DEBUG_LOGS = {
    getLogs: () => ErrorLogger.getLogs(),
    getStatus: () => ({ dataCount: rawData.length, mode: document.getElementById('conn-label')?.textContent })
  };
});
