# Keamanan dashboard publik

- Spreadsheet harus tetap Restricted; tidak boleh Publish to web.
- Hanya ringkasan bulanan per mata uang dikirim oleh GAS. Endpoint publik memang dapat dibaca siapa pun.
- ID spreadsheet dan nama sheet di Script Properties, bukan frontend atau Git.
- Nama wajib bayar, NTPN, keterangan, dan baris mentah tidak boleh dikirim atau disimpan sebagai contoh.
- Ambang publikasi 10 transaksi per kelompok mengurangi, tetapi tidak menghilangkan, risiko inferensi. Pengelola wajib menilai kelayakan publikasi agregat.
- Tidak ada key rahasia di frontend. Tidak ada autentikasi karena data yang disajikan memang untuk publik.
- Hindari endpoint lama yang masih mengeluarkan data mentah: nonaktifkan/redeploy secara manual. Perubahan frontend tidak menutup endpoint lama.
- `.gitignore` hanya mencegah penambahan file tertentu; bukan pemindai rahasia dan tidak menghapus riwayat Git.
- Contoh detail transaksi dari versi lama dihapus pada versi kerja saat ini. Riwayat Git lama mungkin masih memuatnya; nilai keasliannya perlu ditinjau pemilik. Pembersihan riwayat memerlukan rencana terpisah untuk semua clone/fork.
- Jangan catat isi spreadsheet dalam log publik atau error API.
- Kode ini belum merupakan audit keamanan produksi.

Petunjuk pemasangan: [CARA_KERJA.md](CARA_KERJA.md).
