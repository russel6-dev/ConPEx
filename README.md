# ConPEx: Rekening Koran & Buku Besar ke Excel

Extension Chrome/Edge yang mengubah **PDF rekening koran** dan **buku besar (general ledger)**, baik PDF digital maupun **hasil scan**, menjadi **Excel yang rapi**. Setiap angka dicek otomatis.

- **Offline & aman.** File tidak pernah dikirim ke internet. Pembacaan PDF, OCR, dan pembuatan Excel semuanya berjalan di komputer Anda.
- **PDF digital & scan.** Halaman tanpa teks otomatis dibaca dengan OCR (Bahasa Indonesia + Inggris).
- **Bank:** BCA, Mandiri, BRI, BNI, BSI, CIMB Niaga, Permata, Danamon, BTN, OCBC, Panin, Maybank, Mega, Jago. Format lain dibaca dengan mode umum.
- **Beberapa file sekaligus**, misalnya mutasi 12 bulan digabung jadi satu Excel.
- **PDF berpassword** (e-statement) didukung. Password hanya dipakai untuk membuka file di komputer Anda.

## Pengecekan otomatis

**Rekening koran**
1. Saldo per baris: saldo sebelumnya + kredit − debit = saldo tercetak.
2. Total debit, total kredit & jumlah transaksi dibandingkan dengan ringkasan bank di PDF.
3. Saldo akhir: saldo awal + total kredit − total debit = saldo akhir tercetak.
4. Antar halaman: baris yang hilang di pergantian halaman langsung ketahuan.
5. Antar file: saldo akhir bulan lalu = saldo awal bulan ini (untuk no. rekening yang sama).

**Buku besar**
1. Saldo per akun sesuai arah saldo normalnya (debit/kredit, dideteksi otomatis).
2. Total debit/kredit & saldo akhir per akun dibandingkan dengan baris *Total* di PDF.
3. Total debit semua akun = total kredit (seimbang).

**Khusus hasil scan:** angka yang formatnya janggal ditandai kuning. Bila OCR salah membaca tanda `+`/`-` sebagai angka (mis. `+974.600,50` terbaca `1974.600,50`) dan hanya ada satu koreksi yang membuat saldo cocok, angka dikoreksi otomatis dan tetap ditandai kuning beserta catatannya.

## Analisis uang masuk (opsional)

Nyalakan lewat pilihan **Analisis uang masuk → Ya — tandai indikasi penghasilan**. Setiap uang masuk (kredit) diberi kategori, alasan, dan tingkat keyakinan:

| Kategori | Contoh yang dikenali |
|---|---|
| Indikasi penghasilan usaha | transfer masuk dari pihak lain, setoran tunai, QRIS/EDC, virtual account, marketplace, INV/PELUNASAN/TERMIN |
| Penghasilan bunga / bagi hasil | BUNGA, JASA GIRO, BAGI HASIL, DIVIDEN |
| Bukan penghasilan | refund/retur/reversal/koreksi, pencairan pinjaman, setoran modal, pemindahbukuan/rekening sendiri (termasuk nama pengirim = nama pemilik rekening), pencairan deposito |
| Perlu dicek | tidak ada petunjuk, atau petunjuk ambigu seperti "KAS" |

- Kata lengkap, **singkatan** (TRF, PNGMBLN, RVSL, JS GIRO, PB DARI, dll.), dan **typo / salah baca OCR** (mis. "RETUN" → RETUR) dikenali. Hasil dari singkatan bermakna ganda atau typo diberi keyakinan lebih rendah.
- Kategori bisa diganti lewat dropdown. Klik **＋ jadikan aturan** agar transaksi serupa ikut berubah. Aturan disimpan di browser dan dipakai untuk file berikutnya.
- Ini **indikasi otomatis, bukan kesimpulan pajak**.

## Isi file Excel

| Sheet | Isi |
|---|---|
| **Hasil Convert** | Murni hasil convert (tanggal, keterangan, debit, kredit, saldo) tanpa kolom tambahan. |
| **Transaksi** / **Buku Besar** | Tanggal (format tanggal asli), keterangan, debit, kredit, saldo (angka asli, bisa dijumlah), lalu kolom **Saldo Hitung, Selisih, Status** berupa **rumus Excel**. Baris bermasalah otomatis merah. Ada filter dan header yang dibekukan. |
| **Rekonsiliasi** / **Ringkasan Akun** | Perbandingan "Menurut PDF" dan "Hasil Hitung" (rumus SUM/COUNTIF) dengan status COCOK/SELISIH, plus catatan pemeriksaan. |

| **Uang Masuk - Bulanan / Rincian / Ringkasan** | Hanya bila analisis uang masuk dinyalakan: rekap per bulan untuk ekualisasi (dengan kolom peredaran bruto SPT/PPN untuk diisi), rincian per transaksi untuk pemeriksaan (kolom penjelasan & dokumen pendukung), dan ringkasan per kategori & pengirim terbesar. Semua memakai SUMIFS ke kolom kategori di sheet Transaksi. |

Karena pengecekannya berupa rumus, bila angka di Excel diubah, status cek ikut berubah.

## Cara instal

### A. Dari file ZIP (untuk dibagikan ke teman)
1. Unduh `ConPEx-v1.1.0.zip` dari halaman **Releases** repo ini, lalu ekstrak.
2. Buka `chrome://extensions` (Edge: `edge://extensions`).
3. Nyalakan **Developer mode** (pojok kanan atas).
4. Klik **Load unpacked**, lalu pilih folder hasil ekstrak (yang berisi `manifest.json`).
5. Klik ikon puzzle di toolbar lalu pin **ConPEx**.

> Cara ini tidak update otomatis. Untuk versi baru, ulangi langkah di atas dengan ZIP terbaru.

### B. Dari Chrome Web Store
Belum dipublikasikan. Lihat bagian [Publikasi ke Chrome Web Store](#publikasi-ke-chrome-web-store).

## Cara pakai
1. Klik ikon **ConPEx** di toolbar. Halaman konverter terbuka di tab baru.
2. Seret PDF ke kotak unggah (bisa beberapa file).
3. Lihat **Hasil pengecekan**. Klik item merah/kuning untuk melompat ke baris yang bermasalah.
4. Perbaiki sel bila perlu: klik sel untuk mengedit, ⇄ untuk menukar debit/kredit, ＋ untuk menyisip baris, ✕ untuk menghapus. Cek langsung dihitung ulang.
5. Klik **Unduh Excel**.

Bila sedang membuka PDF di Chrome, klik ikon ConPEx atau klik-kanan link PDF lalu pilih **Ubah PDF ini ke Excel (ConPEx)**.

## Izin yang diminta
- `contextMenus`: menu klik-kanan "Ubah PDF ini ke Excel".
- `activeTab`: membaca alamat PDF di tab yang sedang dibuka saat ikon diklik.
- Akses situs (opsional, ditanyakan saat dipakai): hanya untuk mengambil PDF dari tab yang Anda pilih.

Tidak ada data yang dikirim ke server mana pun. Lihat [PRIVACY.md](PRIVACY.md).

## Batasan
- Scan buram, miring, atau beresolusi rendah bisa salah baca. Pengecekan saldo akan menandainya, tapi tetap perlu koreksi manual.
- OCR file scan yang tebal butuh beberapa detik per halaman.
- Format bank yang tata letaknya sangat berbeda mungkin perlu memilih **Jenis dokumen/Bank** secara manual atau dikoreksi di tabel. Kirim contoh (sudah disensor) lewat *Issues* supaya formatnya bisa ditambahkan.

## Pengembangan

```
extension/            ← isi extension (dimuat apa adanya oleh Chrome)
  manifest.json, background.js
  app.html/.css/.js   ← halaman konverter
  engine.js           ← mesin baca & cek (tanpa DOM, bisa dites di Node)
  excel.js            ← pembuat .xlsx (ExcelJS) dengan rumus cek
  income.js           ← analisis uang masuk (indikasi penghasilan)
  lib/                ← pdf.js 3.11.174, Tesseract.js 5.1.1 (+ data ind/eng), ExcelJS 4.4.0
test/
  make_samples.py     ← buat contoh PDF fiktif (BCA, BRI, Mandiri, BNI, buku besar)
  make_scans.py       ← buat versi "hasil scan" dari contoh
  run.js / ocr.js     ← uji mesin (PDF digital / OCR)
  income.js           ← uji klasifikasi uang masuk & tebakan pengirim
  e2e_income.js       ← uji fitur analisis uang masuk di extension
  excel.js            ← buat Excel dari contoh
  e2e.js / e2e_ui.js  ← uji extension di Chromium (Playwright)
scripts/build-zip.sh  ← buat dist/ConPEx-vX.Y.Z.zip
```

Menjalankan tes (perlu `pdfjs-dist@3.11.174`, `tesseract.js@5.1.1`, `exceljs@4.4.0`, `playwright`):

```bash
npm i pdfjs-dist@3.11.174 tesseract.js@5.1.1 exceljs@4.4.0
python3 test/make_samples.py && python3 test/make_scans.py
node test/run.js           # semua contoh PDF digital
node test/ocr.js bca_nov2025
node test/e2e.js out test/samples/bca_nov2025.pdf
```

Semua contoh PDF di `test/samples` **fiktif**.

## Publikasi ke Chrome Web Store
1. Daftar di [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (biaya sekali USD 5).
2. Jalankan `scripts/build-zip.sh`, lalu unggah `dist/ConPEx-vX.Y.Z.zip`.
3. Isi deskripsi dan screenshot. Untuk privasi, centang bahwa extension **tidak mengumpulkan data pengguna** dan tautkan `PRIVACY.md`.
4. Pilih visibilitas **Unlisted** bila hanya untuk teman (hanya yang punya link yang bisa instal).
5. Microsoft Edge Add-ons juga menerima ZIP yang sama (gratis).
