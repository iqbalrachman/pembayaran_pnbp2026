'use strict';
const $ = id => document.getElementById(id);
let summary = [], mode = 'demo', loading = false;
const money = (n, currency) => new Intl.NumberFormat('id-ID', {style:'currency',currency,maximumFractionDigits:0}).format(n);
const number = n => new Intl.NumberFormat('id-ID').format(n);
// Sepenuhnya sintetis: bukan hasil ekspor atau turunan spreadsheet.
function demoData() {
  return {status:'success',schemaVersion:1,updatedAt:null,summary:Array.from({length:12},(_,i)=>['IDR','USD'].map(currency=>({period:`2026-${String(i+1).padStart(2,'0')}`,currency,transactions:40+i*7,revenue:currency==='IDR'?180000000+i*23000000:12000+i*1700}))).flat()};
}
function validate(payload) {
  if (!payload || payload.status !== 'success' || payload.schemaVersion !== 1 || !Array.isArray(payload.summary) || payload.summary.length > 2400) throw new Error('Format API tidak sesuai kontrak publik.');
  const seen = new Set();
  return payload.summary.map(r => {
    if (!r || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period) || !['IDR','USD'].includes(r.currency) || !Number.isSafeInteger(r.transactions) || r.transactions < 10 || !Number.isFinite(r.revenue) || r.revenue < 0) throw new Error('Ringkasan publik tidak valid.');
    const key = r.period+r.currency;
    if(seen.has(key)) throw new Error('Periode duplikat.');
    seen.add(key);
    // Whitelist, jangan simpan field tambahan dari server.
    return {period:r.period,currency:r.currency,transactions:r.transactions,revenue:r.revenue};
  });
}
function selected(){return summary.filter(r=>r.period.startsWith($('year').value+'-')&&r.currency===$('currency').value).sort((a,b)=>a.period.localeCompare(b.period));}
function render(){
  const rows=selected(),currency=$('currency').value,total=rows.reduce((s,r)=>s+r.revenue,0),count=rows.reduce((s,r)=>s+r.transactions,0);
  $('revenue').textContent=money(total,currency);$('transactions').textContent=number(count);$('average').textContent=money(count?total/count:0,currency);$('periods').textContent=rows.length+' bulan';$('chart-unit').textContent=currency+' · skala linear';
  $('rows').replaceChildren();$('chart').replaceChildren();$('empty').hidden=rows.length>0;
  const max=Math.max(1,...rows.map(r=>r.revenue));
  for(const r of rows){
    const tr=document.createElement('tr');
    for(const v of [r.period,r.currency,number(r.transactions),money(r.revenue,currency)]){const td=document.createElement('td');td.textContent=v;tr.append(td);}$('rows').append(tr);
    const col=document.createElement('div');col.className='bar-column';const bar=document.createElement('div');bar.className='bar';bar.style.height=(r.revenue/max*180)+'px';bar.title=r.period+': '+money(r.revenue,currency);bar.setAttribute('role','img');bar.setAttribute('aria-label',bar.title);const label=document.createElement('span');label.textContent=r.period.slice(5);col.append(bar,label);$('chart').append(col);
  }
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='Tidak ada data untuk pilihan ini.';tr.append(td);$('rows').append(tr);}
  $('export').disabled=loading||!rows.length;
}
async function load(){
  if(loading)return;loading=true;$('refresh').disabled=true;$('export').disabled=true;
  const url=window.PUBLIC_CONFIG?.API_URL;
  $('status').textContent='Memuat ringkasan…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    let payload;
    if(!url){mode='demo';payload=demoData();}else{
      if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))throw new Error('URL API publik tidak valid.');
      const res=await fetch(url,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'follow'});
      if(!res.ok)throw new Error('API tidak tersedia.');payload=await res.json();mode='live';
    }
    summary=validate(payload);
    const previous=$('year').value,years=[...new Set(summary.map(r=>r.period.slice(0,4)))].sort().reverse();$('year').replaceChildren();
    for(const y of years){const option=document.createElement('option');option.value=y;option.textContent=y;$('year').append(option);}if(years.includes(previous))$('year').value=previous;
    $('status').textContent=mode==='demo'?'DEMO · Data fiktif':'LIVE · Ringkasan publik';$('status').parentElement.className='notice'+(mode==='live'?' live':'');
    $('status-detail').textContent=mode==='demo'?'API agregat belum diaktifkan. Angka ini hanya ilustrasi, bukan laporan BMKG.':'Hanya kelompok bulanan dengan minimal 10 transaksi yang dipublikasikan.';
    const date=new Date(payload.updatedAt);$('updated').textContent=mode==='live'&&payload.updatedAt&&!isNaN(date)?'Diambil dari sumber: '+date.toLocaleString('id-ID'):'';
  }catch(error){
    summary=[];mode='error';$('year').replaceChildren();$('status').textContent='Data tidak tersedia';$('status').parentElement.className='notice error';$('status-detail').textContent='Gagal memuat ringkasan publik. Periksa konfigurasi/deployment GAS, lalu coba lagi. Tidak ada penggantian diam-diam dengan data contoh.';$('updated').textContent='';
  }finally{clearTimeout(timer);loading=false;$('refresh').disabled=false;render();}
}
$('year').addEventListener('change',render);$('currency').addEventListener('change',render);$('refresh').addEventListener('click',load);
$('export').addEventListener('click',()=>{
  const rows=selected();if(!rows.length)return;
  const csv=['mode,periode,mata_uang,jumlah_transaksi,penerimaan',...rows.map(r=>[mode,r.period,r.currency,r.transactions,r.revenue].join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`pnbp-ringkasan-${mode}-${$('year').value}-${$('currency').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
load();
