/** Pasang manual di Apps Script. Semua konfigurasi privat ada di Script Properties. */
function doGet() {
  let stage = 'CONFIG';
  try {
    const props = PropertiesService.getScriptProperties();
    if ((props.getProperty('PUBLIC_SUMMARY_ENABLED') || '').trim() !== 'true') throw new Error('Disabled');
    const id = (props.getProperty('SPREADSHEET_ID') || '').trim();
    const sheetName = (props.getProperty('SHEET_NAME') || 'Data').trim();
    if (!id || !sheetName) throw new Error('Missing configuration');
    stage = 'SOURCE_ACCESS';
    const sheet = SpreadsheetApp.openById(id).getSheetByName(sheetName);
    if (!sheet) throw new Error('Missing sheet');
    stage = 'READ_SOURCE';
    const values = sheet.getDataRange().getValues();
    stage = 'HEADERS';
    if (!values.length) throw new Error('Invalid schema');
    const headers = values.shift().map(normalizeHeader_);
    const names = ['TANGGAL BAYAR', 'MATA UANG', 'SETORAN PER AKUN'];
    const indexes = names.map(name => headers.indexOf(name));
    if (names.some(name => headers.filter(h => h === name).length !== 1)) throw new Error('Ambiguous schema');
    if (indexes.some(i => i < 0)) throw new Error('Invalid schema');
    const groups = Object.create(null);
    values.forEach(row => {
      if (row.every(v => v === null || v === undefined || String(v).trim() === '')) return;
      stage = 'ROW_DATE';
      const period = summaryPeriod_(row[indexes[0]]);
      stage = 'ROW_CURRENCY';
      const currency = String(row[indexes[1]]).trim().toUpperCase();
      if (!['IDR', 'USD'].includes(currency)) throw new Error('Invalid currency');
      stage = 'ROW_REVENUE';
      const revenue = summaryRevenue_(row[indexes[2]]);
      const key = period + currency;
      if (!groups[key]) groups[key] = { period: period, currency: currency, transactions: 0, revenue: 0 };
      groups[key].transactions++;
      groups[key].revenue += revenue;
      stage = 'TOTAL_OVERFLOW';
      if (!isFinite(groups[key].revenue)) throw new Error('Invalid total');
    });
    // Tidak ada query drill-down/filter privat. Ambang tetap mengurangi risiko kelompok kecil.
    const summary = Object.keys(groups).map(k => groups[k]).filter(r => r.transactions >= 10).sort((a,b) => a.period.localeCompare(b.period));
    stage = 'SERIALIZE';
    return jsonOutput_({status:'success', schemaVersion:1, updatedAt:new Date().toISOString(), summary:summary, build:'public-summary-v2'});
  } catch (error) {
    // Hanya tahap tetap, bukan exception/stack/ID/isi baris. Log tidak dikirim ke publik.
    console.error('[PUBLIC_SUMMARY] FAILED stage=' + stage);
    return jsonOutput_({status:'error', schemaVersion:1, build:'public-summary-v2', code:stage, message:'Ringkasan tidak tersedia.'});
  }
}
function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/** Normalisasi header saja; tidak mengubah nilai data sumber. */
function normalizeHeader_(value) {
  return String(value).replace(/\uFEFF/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Jalankan manual di editor. Akhiran _ mencegah panggilan google.script.run. */
function diagnoseSummary_() {
  const response = JSON.parse(doGet().getContent());
  console.log('[PUBLIC_SUMMARY] status=' + response.status);
  // Jika error, lihat FAILED stage di execution log. Jangan log respons data.
}

/** Date asli Sheets atau teks tanggal eksplisit; tidak memakai parsing locale ambigu. */
function summaryPeriod_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    const period = Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Invalid date');
    return period;
  }
  const text = String(value).trim();
  let iso = text;
  const english = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})$/i.exec(text);
  if (english) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    iso = english[3] + '-' + String(months.indexOf(english[1].toLowerCase()) + 1).padStart(2, '0') + '-' + english[2].padStart(2, '0');
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(iso)) throw new Error('Invalid date');
  const parsed = new Date(iso + 'T00:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== iso) throw new Error('Invalid date');
  return iso.slice(0,7);
}

/** Angka Sheets atau teks desimal polos saja; pemisah ribuan ambigu ditolak. */
function summaryRevenue_(value) {
  let number = value;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) number = Number(value.trim());
  if (typeof number !== 'number' || !isFinite(number) || number < 0) throw new Error('Invalid revenue');
  return number;
}
