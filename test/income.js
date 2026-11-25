// Uji klasifikasi uang masuk: node test/income.js
const I = require('../extension/income.js');
const cases = [
  ['TRSF E-BANKING CR 0212/FTSCY/WS95051 PANDUWAN ADITIAN T', 'usaha'],
  ['MCM InhouseTrfCS-CS saldo awal rek spim ho', 'non'],
  ['MCM InhouseTrfCS-CS retun perhitungan', 'non'],
  ['MCM InhouseTrfCS-CS penyesuaian saldo', 'non'],
  ['Bunga Rekening', 'bunga'],
  ['MCM InhouseTrfCS-CS KAS', 'cek'],
  ['SETORAN TUNAI KAS KECIL', 'cek'],
  ['TRSF E-BANKING CR INV 22 KAS', 'usaha'],
  ['TRSF E-BANKING CR INV 023 PT MAJU JAYA', 'usaha'],
  ['SETORAN TUNAI CABANG SUDIRMAN', 'usaha'],
  ['QRIS SETTLEMENT MERCHANT 123', 'usaha'],
  ['TOKOPEDIA PAYOUT', 'usaha'],
  ['TRF DR PT ABC PNGMBLN DANA', 'non'],
  ['PENCAIRAN KREDIT KMK 2024', 'non'],
  ['PNCRN KREDIT INVESTASI', 'non'],
  ['SETORAN MODAL DIREKTUR', 'non'],
  ['TRSF E-BANKING CR PT CONTOH SENTOSA', 'non', 'PT CONTOH SENTOSA'],
  ['BI-FAST CR BUDI SANTOSO', 'usaha'],
  ['RVSL TRF 0912', 'non'],
  ['KOREKSI BUNGA', 'non'],
  ['JASA GIRO', 'bunga'],
  ['KR OTOMATIS GAJI KARYAWAN NOV', 'usaha'],
  ['PENCAIRAN DEPOSITO 3 BLN', 'non'],
  ['PEMBAYRAN TAGIHAN 05', 'usaha'],
  ['KOLEKSI BUKU ANTIK', 'cek'],
  ['0938', 'cek'],
  ['REFUND SHOPEE ORDER 9912', 'non'],
  ['PB DARI 12345', 'non'],
  ['PB 12345', 'cek'],
  ['TRF KE BATAM', 'usaha'],
  ['PENGEMBLIAN DANA PROYEK', 'non'],
  ['PELUNASAN PIUTANG', 'usaha'],
  ['PINJAMAN DIREKTUR', 'non'],
];
let fail = 0;
for (const [d, exp, owner] of cases) {
  const r = I.classify(d, { ownerName: owner });
  const ok = r.cat === exp;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${d.padEnd(55)} → ${r.cat.padEnd(5)} ${r.conf.padEnd(6)} ${r.jenis} | ${r.reason}`);
}
const parties = [
  ['TRSF E-BANKING CR INV 0231 PT MAJU JAYA', 'PT MAJU JAYA'], ['BI-FAST CR BUDI SANTOSO PELUNASAN', 'BUDI SANTOSO'],
  ['TRSF E-BANKING CR 3011/FTSCY/WS95051', ''], ['BUNGA REKENING', ''], ['SETORAN MODAL DIREKTUR', 'DIREKTUR'],
  ['TRF DR CV SINAR TERMIN 2', 'CV SINAR'], ['TRSF E-BANKING CR 0212/FTSCY/WS95051 TANGGAL :02/12 196000000.00 PANDUWAN ADITIAN T', 'PANDUWAN ADITIAN'],
  ['QRIS SETTLEMENT MERCHANT 8812', ''], ['KR OTOMATIS PT ANUGERAH', 'PT ANUGERAH'],
];
for (const [d, exp] of parties) { const g = I.guessParty(d); const ok = g === exp; if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} pihak: ${d.slice(0, 50).padEnd(50)} → "${g}"`); }
console.log(fail ? `${fail} gagal` : 'semua lolos');
process.exit(fail ? 1 : 0);
