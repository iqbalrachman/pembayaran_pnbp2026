const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('gas/Code.gs','utf8');
function run(rows,enabled='true',headers=['TANGGAL BAYAR','MATA UANG','SETORAN PER AKUN','NTPN'], options={}){
 const context={console:{error:message=>{assert.match(message,/^\[PUBLIC_SUMMARY\] FAILED stage=[A-Z_]+$/);}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>({PUBLIC_SUMMARY_ENABLED:enabled,SPREADSHEET_ID:'test-only',SHEET_NAME:'test-only',...options.properties})[k]})},SpreadsheetApp:{openById:()=>{if(options.denied)throw new Error('PRIVATE SOURCE');return {getSheetByName:()=>options.missingSheet?null:({getDataRange:()=>({getValues:()=>[headers,...rows]})})};}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>({getContent:()=>text})})},Utilities:{formatDate:()=> '2026-01'}};
 vm.createContext(context);vm.runInContext(source,context);return JSON.parse(context.doGet().getContent());
}
const row=['2026-01-02','IDR',100,'PRIVATE TEST MARKER'];
assert.equal(run(Array.from({length:9},()=>row)).summary.length,0);
const result=run(Array.from({length:10},()=>row));
assert.equal(result.summary[0].revenue,1000);assert.equal(result.summary[0].transactions,10);
assert.equal(JSON.stringify(result).includes('PRIVATE TEST MARKER'),false);
assert.deepEqual(Object.keys(result.summary[0]).sort(),['currency','period','revenue','transactions']);
assert.equal(run([['2026-02-30','IDR',10]]).status,'error');
assert.equal(run([['2026-01-01','IDR','Rp 10']]).status,'error');
assert.equal(run([], 'false').status,'error');
assert.equal(run([...Array.from({length:10},()=>row),...Array.from({length:10},()=>['2026-01-02','USD',2])]).summary.length,2);
console.log('PASS: aggregation, privacy whitelist, suppression, currency separation, invalid input, disabled publishing');

assert.equal(run(Array.from({length:10},()=>row),'true',[' tanggal  bayar ', 'Mata Uang', 'SETORAN PER AKUN','NTPN']).status,'success');
assert.equal(run([row],'true',['TANGGAL BAYAR','MATA UANG','SETORAN PER AKUN','TANGGAL BAYAR']).status,'error');
assert.equal(run([['   ',' ',null,' ']]).summary.length,0);
assert.equal(run([['2026-01-01','EUR',1]]).status,'error');
console.log('PASS: normalized headers, duplicate header rejection, blank rows, safe diagnostic logs');

const headers=['TANGGAL BAYAR','MATA UANG','SETORAN PER AKUN','NTPN'];
assert.equal(run([], 'true', headers, {denied:true}).code,'SOURCE_ACCESS');
assert.equal(run([], 'true', headers, {missingSheet:true}).code,'SOURCE_ACCESS');
assert.equal(run([], 'true', headers, {properties:{SPREADSHEET_ID:''}}).code,'CONFIG');
assert.equal(run([['bad','IDR',1]]).code,'ROW_DATE');
assert.equal(run([['2026-01-01','EUR',1]]).code,'ROW_CURRENCY');
assert.equal(run([['2026-01-01','IDR','1.000,50']]).code,'ROW_REVENUE');
assert.equal(run([['2026-01-01','IDR',Infinity]]).status,'error');
assert.equal(run([['2026-01-01','IDR',-1]]).status,'error');
assert.equal(run(Array.from({length:10},()=>['January 1, 2026','IDR','100.5'])).summary[0].revenue,1005);
assert.equal(run([['February 30, 2026','IDR',1]]).status,'error');
assert.equal(run(Array.from({length:10},()=>[new Date('2026-01-01T00:00:00Z'),'IDR',100])).summary[0].period,'2026-01');
assert.equal(run([], 'true',headers).summary.length,0);
assert.equal(run([['2026-01-01','IDR',1e308],['2026-01-01','IDR',1e308]]).code,'TOTAL_OVERFLOW');
// Pengujian kedua: JSON backend diproses validator frontend asli.
const frontend=fs.readFileSync('app.js','utf8').split('function selected()')[0];
const browser={Intl,document:{getElementById:()=>null}};vm.createContext(browser);vm.runInContext(frontend,browser);
assert.equal(browser.validate(result).length,1);
assert.throws(()=>browser.validate({status:'success',data:[]}));
assert.throws(()=>browser.validate(run([], 'false')));
assert.equal(browser.validate(run(Array.from({length:10},()=>['2026-01-01','USD',0])))[0].revenue,0);
console.log('PASS: permissions/config failures, Date objects, English dates, decimal strings, overflow, frontend JSON contract');
