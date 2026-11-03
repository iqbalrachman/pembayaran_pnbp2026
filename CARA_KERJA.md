# Dashboard PNBP publik — cara kerja dan deployment

## Kebijakan
Dashboard bebas diakses, tetapi spreadsheet dan data transaksi mentah tetap privat. Semua informasi yang dikirim ke browser publik dapat disalin. Karena itu backend hanya mengirim ringkasan yang disetujui untuk dipublikasikan, bukan menyembunyikan kolom sesudah data tiba di browser.

Tidak ada ID/tautan spreadsheet pengguna atau salinan data sumber dalam konfigurasi ini. Preview memakai angka sintetis. Data live belum diverifikasi atau diaktifkan.

## File sumber
| File | Fungsi |
|---|---|
| `index.html` | Struktur halaman publik; memuat config.js, style.css, app.js |
| `config.js` | Konfigurasi publik; API_URL kosong berarti demo eksplisit |
| `app.js` | Fetch, validasi kontrak, filter tahun/mata uang, grafik, ekspor agregat |
| `style.css` | Tampilan responsif lokal, tanpa CDN |
| `gas/Code.gs` | Template backend Apps Script untuk dipasang manual |
| `SECURITY.md` | Batas keamanan dan kewajiban pengelola |
| `tests/public-summary.test.cjs` | Pengujian kontrak backend dengan Spreadsheet mock |

## Alur
Spreadsheet Restricted → GAS (validasi dan agregasi) → JSON ringkasan publik → dashboard.

GAS hanya membaca tiga kolom: `TANGGAL BAYAR`, `MATA UANG`, `SETORAN PER AKUN`. Gunakan tanggal sel Google Sheets atau teks ISO YYYY-MM-DD, kode IDR/USD, serta nominal numerik. Baris tidak valid menyebabkan kegagalan tertutup, bukan laporan parsial yang tampak berhasil. Satu baris dianggap satu transaksi; sesuaikan aturan bisnis sebelum produksi.

Data dikelompokkan per bulan dalam zona Asia/Jakarta dan mata uang. Hanya kelompok dengan minimal 10 transaksi diterbitkan. Tidak ada query berdasarkan wajib bayar, satker, NTPN, atau transaksi individu. Ambang bukan jaminan anonimitas: pengelola tetap harus menilai potensi inferensi/differencing dari pembaruan data. Untuk risiko tinggi, gunakan periode yang sudah ditutup dan snapshot publikasi yang disetujui, bukan sumber berjalan.

## Pasang GAS secara manual
1. Pastikan spreadsheet **Restricted** dan tidak dipublikasikan ke web.
2. Buat proyek Apps Script yang dikelola akun berwenang. Salin `gas/Code.gs`.
3. Di Project Settings → Script Properties, tambahkan `SPREADSHEET_ID` dan `SHEET_NAME` dengan nilai privat yang benar. Jangan menuliskan nilainya di repository, chat tambahan, atau contoh kode.
4. Audit ringkasan yang akan dirilis. Tambahkan `PUBLIC_SUMMARY_ENABLED=true` hanya setelah pengelola menyetujui publikasi.
5. Deploy sebagai Web app, execute as pemilik yang berwenang, akses publik jika kebijakan Workspace mengizinkan. Beri izin sumber sesuai kebutuhan. Jangan membuka izin spreadsheet untuk publik.
6. Uji URL `/exec` dari sesi browser tanpa login. Pastikan respons hanya memuat kontrak agregat di bawah; periksa juga akses lintas origin dari hosting dashboard. Tidak ada header CORS buatan atau proxy publik untuk melewati pembatasan.
7. Masukkan URL deployment agregat yang telah diuji ke `PUBLIC_CONFIG.API_URL` di `config.js`. URL endpoint publik bukan rahasia. Jangan gunakan deployment lama yang mengeluarkan baris mentah.
8. **Nonaktifkan atau redeploy endpoint GAS lama yang mengekspos detail.** Mengubah dashboard tidak menghentikan akses langsung ke endpoint tersebut.

Template belum dipasang ke akun Google dan koneksi live belum diuji. Kode GAS proyek lama serta izin aktual tidak tersedia untuk pemeriksaan. URL pengguna tidak disalin ke source.

## Kontrak API
```json
{
  "status": "success",
  "schemaVersion": 1,
  "updatedAt": "2026-10-27T02:00:00.000Z",
  "summary": [
    {"period":"2026-01","currency":"IDR","transactions":20,"revenue":10000000}
  ]
}
```
Contoh ini fiktif. `updatedAt` adalah waktu pembacaan sumber, bukan waktu edit terakhir spreadsheet. Respons error hanya berisi status dan pesan generik, tanpa exception atau isi baris. Format lama `{status,data:[baris mentah]}` sengaja ditolak frontend. Field tambahan tidak dipakai/disimpan frontend, tetapi keamanan tetap wajib ditegakkan di GAS sebelum respons dikirim.

## Perhitungan dan interaksi
- Tahun dan mata uang memfilter ringkasan yang telah dipublikasikan.
- Total penerimaan dan transaksi hanya menjumlahkan kelompok yang lolos ambang publikasi.
- Rata-rata = total penerimaan / transaksi, dalam satu mata uang; IDR dan USD tidak pernah dijumlahkan.
- Grafik batang skala linear; tabel menyediakan nilai lengkap termasuk nol.
- Kelompok kecil disembunyikan, sehingga total publik dapat berbeda dari laporan internal.
- Ekspor CSV hanya ringkasan terpilih dengan label `demo` atau `live`. Tidak ada ekspor detail transaksi.
- Tidak ada forecast semu atau ranking wajib bayar.
- Timeout 15 detik; tombol muat ulang untuk retry manual. Tidak ada polling otomatis atau penyimpanan data ke localStorage.
- Jika URL kosong: label DEMO dan data sintetis. Jika URL terisi tetapi gagal: data dikosongkan dan error ditampilkan, tanpa fallback diam-diam.
- Semua nilai dinamis ditampilkan melalui textContent/DOM, bukan interpolasi HTML.

## Jalankan preview
```bash
python3 -m http.server 8000 --bind 0.0.0.0
```
Buka URL preview yang disediakan lingkungan, atau localhost:8000 bila menjalankan di komputer sendiri. Tidak perlu npm install, CDN, atau proses build.

## Pengujian
```bash
node --check app.js
node tests/public-summary.test.cjs
```
Periksa manual pada browser: label demo, pergantian mata uang/tahun, grafik dan tabel, ekspor, tombol refresh, tampilan mobile, serta kegagalan endpoint. Sebelum produksi uji GAS nyata dan audit izin spreadsheet/deployment.

## GitHub dan riwayat
Data contoh detail di versi sebelumnya telah dihapus dari file kerja. Ini **tidak menghapus commit lama, clone, fork, atau deployment lama**. Keaslian data historis harus diperiksa pemilik; jika sensitif, lakukan penanganan insiden dan pembersihan riwayat terencana. Tidak ada jaminan penghapusan salinan pihak lain. `.gitignore` mengabaikan CSV/XLSX, environment, dan log, tetapi pemeriksaan sebelum commit tetap diperlukan.

## Pengembangan berikutnya
- Persetujuan snapshot agregat periode tertutup untuk mengurangi inferensi dari perubahan harian.
- Monitoring kuota dan ketersediaan GAS tanpa mencatat detail sumber.
- Pengujian browser otomatis dan aksesibilitas.
- Target/realisasi hanya jika target publik disetujui dan dipisahkan per mata uang.
- Backend terautentikasi terpisah jika nanti membutuhkan dashboard detail internal; jangan menambahkan detail ke API publik ini.

## Diagnosis GAS yang aman
Setelah mengganti seluruh kode deployment dengan `gas/Code.gs`, jalankan `diagnoseSummary_` dari editor dan lihat Execution log. Fungsi berakhiran `_` tidak tersedia untuk `google.script.run`. Jangan menambahkan fungsi diagnosis publik atau menyalin exception/data sumber ke respons API.

Kode `FAILED stage` hanya menunjukkan tahap:
- `CONFIG`: properti belum lengkap atau publikasi belum diaktifkan.
- `SOURCE_ACCESS`: sumber tidak dapat diakses atau tab tidak ditemukan.
- `READ_SOURCE`: pembacaan sumber gagal.
- `HEADERS`: kolom wajib hilang atau duplikat. Header dinormalisasi untuk kapitalisasi, spasi, dan BOM.
- `ROW_DATE`: ada tanggal tidak valid.
- `ROW_CURRENCY_OR_REVENUE`: mata uang atau nominal tidak valid.
- `TOTAL_OVERFLOW`: agregat di luar batas angka.
- `SERIALIZE`: pembuatan respons gagal.

Log ini tidak memuat ID, nama tab, nomor baris, nilai transaksi, atau exception asli. Satu baris invalid tetap menggagalkan publikasi agar tidak menghasilkan total parsial. Diagnosis lokal dengan mock tidak membuktikan izin/deployment Google sudah benar. Setelah menyimpan perubahan, pilih Manage deployments → Edit → New version → Deploy.

## Revisi backend public-summary-v2
- Respons sukses: `status=success`, `schemaVersion=1`, `updatedAt`, array `summary`, dan penanda `build=public-summary-v2`.
- Respons gagal: `status=error`, `schemaVersion=1`, `build`, `code` tahap tetap, pesan generik. `code` tidak memuat isi sumber atau exception.
- `SHEET_NAME` kosong/tidak ada memakai default `Data`. ID sumber dan flag publikasi tetap wajib.
- Selain tanggal asli Sheets dan ISO, teks tanggal Inggris seperti `January 1, 2026` didukung secara eksplisit dengan validasi kalender. Format tanggal ambigu tetap ditolak.
- Nominal menerima angka Sheets atau teks desimal polos seperti `1000.50`. Rupiah, koma, pemisah ribuan, nilai negatif dan angka tak hingga ditolak; tidak ada tebakan format uang.
- Jika gagal, respons sekarang menunjukkan `code=ROW_CURRENCY` atau `ROW_REVENUE` secara terpisah, menggantikan tahap gabungan lama.
- Fungsi diagnosis harus dijalankan sebagai `diagnoseSummary_` dari editor; jangan membagikan log sumber.

### Checklist aktivasi data asli (wajib di lingkungan Google)
1. Ganti seluruh kode proyek publik dengan `gas/Code.gs`; hapus fungsi lama yang mengeluarkan detail/menjalankan AI publik.
2. Atur Script Properties sesuai langkah pemasangan. Tidak ada nilai privat yang disertakan file ini.
3. Jalankan `diagnoseSummary_`, berikan otorisasi yang diperlukan, dan periksa log.
4. Deploy sebagai pemilik dengan akses sumber, akses Anyone, **New version**.
5. Buka URL `/exec` tanpa login. Pastikan `build` adalah `public-summary-v2`; build berbeda/hilang berarti versi atau URL belum benar.
6. Jika error, gunakan `code` untuk memperbaiki konfigurasi/data; jangan membuka izin spreadsheet ke publik.
7. Jika sukses, audit respons agregat, lalu isi API_URL di config.js. Bandingkan total per mata uang dengan kelompok sumber yang lolos ambang minimal 10 transaksi.
8. Uji fetch dari browser preview (termasuk redirect/CORS), label LIVE, filter, dan ekspor. Jika belum lolos, preview belum dinyatakan terkoneksi.

Pengujian lokal memakai mock, termasuk Date asli, tanggal Inggris, nominal, izin gagal, header, ambang privasi, overflow dan kontrak validator frontend. Pengujian tersebut tidak membuktikan izin, kuota, jaringan Google, atau versi deployment aktual. Tidak ada garansi data live sebelum checklist lingkungan Google lolos.
