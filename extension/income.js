/*
 * ConPEx — analisis uang masuk: indikasi penghasilan vs bukan penghasilan.
 * Murni logika (tanpa DOM). Mengenali kata lengkap, singkatan, dan typo/salah baca OCR.
 *
 * Kategori:
 *   usaha : Indikasi penghasilan usaha
 *   bunga : Penghasilan bunga / bagi hasil
 *   non   : Bukan penghasilan
 *   cek   : Perlu dicek
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ConPExIncome = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATS = {
    usaha: 'Indikasi penghasilan usaha',
    bunga: 'Penghasilan bunga / bagi hasil',
    non: 'Bukan penghasilan',
    cek: 'Perlu dicek',
  };
  const CAT_ORDER = ['usaha', 'bunga', 'non', 'cek'];
  const CONF = ['rendah', 'sedang', 'tinggi'];

  // terms: kata/frasa lengkap (boleh typo); abbr: singkatan (harus persis); weak: singkatan bermakna ganda
  const RULES = [
    // ---------------- bukan penghasilan (didahulukan)
    { cat: 'non', jenis: 'Koreksi / pengembalian dana', conf: 'tinggi',
      terms: ['REVERSAL', 'REVERSE', 'KOREKSI', 'RETUR', 'RETURN', 'REFUND', 'PENGEMBALIAN', 'PENYESUAIAN', 'PEMBATALAN', 'BATAL', 'TOLAKAN', 'TOLAKAN KLIRING', 'CHARGEBACK', 'DANA KEMBALI', 'KEMBALIAN', 'SALAH TRANSFER', 'SALAH KIRIM'],
      abbr: ['RVSL', 'RVS', 'KRKS', 'KRKSI', 'RTR', 'RFND', 'REFND', 'PENGEMB', 'PNGMBLN', 'PNGMBLIAN', 'KMBL', 'KEMBALI', 'PENYES', 'PNYSN', 'ADJUST', 'BTL'],
      weak: ['REV', 'KOR', 'RTN', 'ADJ', 'TLK', 'CB'] },
    { cat: 'non', jenis: 'Pinjaman / pencairan kredit', conf: 'tinggi',
      terms: ['PENCAIRAN KREDIT', 'PENCAIRAN PINJAMAN', 'PINJAMAN', 'KREDIT INVESTASI', 'KREDIT MODAL KERJA', 'DROPPING', 'LOAN', 'LOAN DISBURSEMENT', 'PLAFON', 'FASILITAS KREDIT', 'HUTANG', 'UTANG'],
      abbr: ['PINJ', 'PJM', 'PJMN', 'KMK', 'KUR', 'PNCRN KREDIT', 'CAIR KREDIT', 'CAIR PINJ'],
      weak: ['DROP'] },
    { cat: 'non', jenis: 'Setoran modal', conf: 'tinggi',
      terms: ['SETORAN MODAL', 'TAMBAHAN MODAL', 'PENYERTAAN MODAL', 'PENYERTAAN', 'MODAL DISETOR', 'SETOR MODAL'],
      abbr: ['STR MODAL', 'SETORAN MDL', 'TMB MODAL', 'STR MDL'],
      weak: ['MDL'] },
    { cat: 'non', jenis: 'Pemindahbukuan / rekening sendiri', conf: 'tinggi',
      terms: ['PEMINDAHBUKUAN', 'PINDAH BUKU', 'ANTAR REKENING', 'REKENING SENDIRI', 'REK SENDIRI', 'OWN ACCOUNT', 'SWEEP', 'CASH POOLING', 'POOLING', 'OVERBOOKING', 'KANTOR PUSAT', 'HEAD OFFICE'],
      abbr: ['PMDHBKN', 'ANTAR REK', 'ANTREK', 'OWN ACC', 'PB DARI'],
      weak: ['PB', 'OB', 'HO', 'KP'] },
    { cat: 'non', jenis: 'Pencairan deposito', conf: 'tinggi',
      terms: ['PENCAIRAN DEPOSITO', 'DEPOSITO JATUH TEMPO', 'BREAK DEPOSITO', 'JATUH TEMPO DEPOSITO'],
      abbr: ['PNCRN DEP', 'JT DEP', 'BREAK DEP', 'CAIR DEPO', 'CAIR DEP'],
      weak: ['DEPO'] },
    { cat: 'non', jenis: 'Saldo / pindahan saldo', conf: 'sedang',
      terms: ['SALDO AWAL', 'PINDAHAN SALDO', 'SALDO PINDAHAN', 'PEMINDAHAN SALDO'], abbr: [], weak: [] },

    // ---------------- petunjuk ambigu: kemungkinan uang sendiri (kas), perlu dicek
    { cat: 'cek', jenis: 'Mungkin pindahan kas / dana internal', conf: 'sedang',
      terms: ['KAS', 'KAS KECIL', 'PETTY CASH', 'INTERNAL', 'TITIPAN', 'DANA TALANGAN', 'TALANGAN'], abbr: ['TTPN'], weak: [] },

    // ---------------- bunga / bagi hasil
    { cat: 'bunga', jenis: 'Bunga / jasa giro / bagi hasil', conf: 'tinggi',
      terms: ['BUNGA', 'JASA GIRO', 'BUNGA DEPOSITO', 'BUNGA REKENING', 'BAGI HASIL', 'NISBAH', 'INTEREST', 'CREDIT INTEREST', 'DIVIDEN', 'DIVIDEND'],
      abbr: ['BNG', 'BNG DEP', 'JSGIRO', 'JS GIRO', 'BGH', 'NSBH'],
      weak: ['JG', 'INT', 'DIV'] },

    // ---------------- indikasi penghasilan usaha
    { cat: 'usaha', jenis: 'Kata transaksi penjualan / jasa', conf: 'tinggi',
      terms: ['INVOICE', 'PEMBAYARAN', 'PELUNASAN', 'PENJUALAN', 'TERMIN', 'KOMISI', 'SEWA', 'HONOR', 'HONORARIUM', 'JASA', 'FEE', 'TAGIHAN', 'KONTRAK', 'PROYEK', 'ORDER', 'PESANAN', 'UANG MUKA', 'DOWN PAYMENT', 'SALES', 'GAJI'],
      abbr: ['INV', 'INVC', 'PEMB', 'PMB', 'PMBYRN', 'BYR', 'BYAR', 'BAYAR', 'PELUNSN', 'LUNAS', 'PENJ', 'PNJ', 'PNJLN', 'JUAL', 'KMS', 'HNR', 'SWA', 'DP'],
      weak: ['PO', 'TRM', 'UM', 'JS', 'JSA'] },
    { cat: 'usaha', jenis: 'Merchant / QRIS / virtual account', conf: 'tinggi',
      terms: ['QRIS', 'EDC', 'MERCHANT', 'SETTLEMENT', 'VIRTUAL ACCOUNT'],
      abbr: ['QR', 'MRCH', 'MERCH', 'STLM', 'SETTLE', 'MDR', 'VA'], weak: [] },
    { cat: 'usaha', jenis: 'Marketplace / payment gateway', conf: 'tinggi',
      terms: ['TOKOPEDIA', 'SHOPEE', 'SHOPEEPAY', 'BUKALAPAK', 'LAZADA', 'BLIBLI', 'TIKTOK', 'GOJEK', 'GOPAY', 'GRAB', 'OVO', 'MIDTRANS', 'XENDIT', 'DOKU', 'FASPAY', 'IPAYMU', 'FLIP', 'TRAVELOKA', 'TIKET'],
      abbr: ['TOKPED', 'TKPD', 'LZD', 'DANA'], weak: [] },
    { cat: 'usaha', jenis: 'Setoran tunai', conf: 'sedang',
      terms: ['SETORAN TUNAI', 'SETOR TUNAI', 'CASH DEPOSIT', 'SETORAN', 'SETOR ATM'],
      abbr: ['STR TNI', 'SETORAN TNI', 'STR TUNAI', 'CDM', 'CSH DEP', 'CASH DEP', 'STRN'],
      weak: ['STR', 'SETOR'] },
    { cat: 'usaha', jenis: 'Transfer masuk dari pihak lain', conf: 'sedang',
      terms: ['TRANSFER', 'TRANSFER DARI', 'INCOMING TRANSFER', 'TRANSFER MASUK', 'BI FAST', 'BIFAST', 'SKN', 'LLG', 'RTGS', 'KLIRING', 'KR OTOMATIS', 'KREDIT OTOMATIS', 'INHOUSE', 'INHOUSETRF', 'E BANKING', 'SWITCHING', 'INTERBANK', 'ONLINE TRANSFER'],
      abbr: ['TRF', 'TRSF', 'TRANS', 'TFR', 'TF', 'TRX', 'TRF DR', 'TRF IN', 'MCM'],
      weak: ['KR', 'CR', 'IN'] },
  ];

  // kata umum yang mirip ejaannya dengan kata kunci (jangan dianggap typo)
  const NOT_TYPO = new Set(['KOLEKSI', 'MODEL', 'BATAM', 'BATAK', 'BATAS', 'RETAIL', 'BUNGO', 'TERMINAL', 'SALDO', 'TRANSAKSI', 'TRANSIT', 'SEWAKTU', 'JASAD', 'PINJAM', 'REVISI', 'SERVER', 'LOAD', 'LOANS', 'RETURNS', 'GRAND', 'GRADE', 'GRAB', 'DONA', 'DANU', 'DINA', 'DANI']);

  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  // salah baca OCR umum pada kata yang mayoritas huruf
  const ocrLetters = (t) => {
    const letters = (t.match(/[A-Z]/g) || []).length;
    if (letters < t.length * 0.6) return t;
    return t.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');
  };

  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      let rowMin = prev[0];
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
        if (prev[j] < rowMin) rowMin = prev[j];
      }
      if (rowMin > max) return max + 1;
    }
    return prev[b.length];
  }
  const allowedTypos = (len) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

  /** Cocokkan frasa (array kata) di deret token. mode: 'exact' | 'fuzzy'. Return {start, fuzzyWord} atau null. */
  function findPhrase(tokens, phrase, fuzzy) {
    const n = phrase.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      let fz = null, ok = true;
      for (let k = 0; k < n; k++) {
        const t = tokens[i + k], p = phrase[k];
        if (t === p) continue;
        if (!fuzzy) { ok = false; break; }
        const max = allowedTypos(p.length);
        if (!max || NOT_TYPO.has(t) || /\d/.test(t) && !/[A-Z]{3}/.test(t)) { ok = false; break; }
        const cand = ocrLetters(t);
        if (cand === p || editDistance(cand, p, max) <= max) { fz = fz || { written: t, word: p }; continue; }
        ok = false; break;
      }
      if (ok) return { start: i, fuzzy: fz };
    }
    // bentuk tergabung tanpa spasi, mis. "BIFAST" untuk "BI FAST", "INHOUSETRF"
    if (n > 1) {
      const joined = phrase.join('');
      for (const t of tokens) if (t === joined) return { start: 0, fuzzy: null };
    }
    return null;
  }

  const down = (c) => CONF[Math.max(0, CONF.indexOf(c) - 1)];

  /**
   * Klasifikasikan satu keterangan uang masuk.
   * opts: {ownerName, userRules:[{text, cat, jenis}]}
   * Return {cat, label, jenis, conf, reason}
   */
  function classify(desc, opts = {}) {
    const N = norm(desc);
    const tokens = N ? N.split(' ') : [];
    const ocrTokens = tokens.map(ocrLetters);

    // 1. aturan buatan pengguna (paling kuat)
    for (const r of opts.userRules || []) {
      const p = norm(r.text);
      if (p && (' ' + N + ' ').includes(' ' + p + ' ')) {
        return result(r.cat, r.jenis || 'Aturan Anda', 'tinggi', `aturan Anda: "${r.text}"`);
      }
    }

    // 2. nama pemilik rekening di keterangan -> kemungkinan pemindahbukuan sendiri (diterapkan setelah kamus)
    const own = ownerTokens(opts.ownerName);
    const ownHit = own.length && (() => {
      const hit = own.filter((t) => tokens.includes(t)).length;
      return (own.length === 1 && hit === 1) || (own.length >= 2 && hit >= Math.min(2, own.length));
    })();
    const ownResult = () => result('non', 'Pemindahbukuan / rekening sendiri', 'sedang', `nama pemilik rekening ("${opts.ownerName}") ada di keterangan`);

    // 3. kamus bawaan: kumpulkan semua kecocokan
    const hits = [];
    for (const rule of RULES) {
      const tryList = (list, kind) => {
        for (const term of list) {
          const phrase = norm(term).split(' ');
          let m = findPhrase(tokens, phrase, false) || findPhrase(ocrTokens, phrase, false);
          let fuzzy = null;
          if (!m && kind === 'term') { m = findPhrase(tokens, phrase, true); fuzzy = m && m.fuzzy; }
          if (!m) continue;
          let conf = rule.conf;
          let reason;
          if (kind === 'weak') { conf = 'rendah'; reason = `singkatan "${term}" (makna bisa ganda)`; }
          else if (fuzzy) { conf = down(conf); reason = `mirip kata "${fuzzy.word}" (tertulis "${fuzzy.written}")`; }
          else if (kind === 'abbr') { reason = `singkatan "${term}"`; }
          else reason = `kata "${term}"`;
          hits.push({ rule, conf, reason, len: phrase.join(' ').length, kind });
          return;
        }
      };
      tryList(rule.terms, 'term');
      tryList(rule.abbr, 'abbr');
      tryList(rule.weak, 'weak');
    }
    if (!hits.length) return ownHit ? ownResult() : result('cek', 'Tidak ada petunjuk', 'rendah', 'tidak ada kata petunjuk di keterangan');

    // prioritas: bukan penghasilan > bunga > usaha; tapi petunjuk "lemah" kalah oleh petunjuk kuat kategori lain
    const strong = hits.filter((h) => h.kind !== 'weak');
    const pool = strong.length ? strong : hits;
    const rank = { non: 0, bunga: 1, usaha: 2, cek: 3 };
    pool.sort((a, b) => rank[a.rule.cat] - rank[b.rule.cat] || CONF.indexOf(b.conf) - CONF.indexOf(a.conf) || b.len - a.len);
    let best = pool[0];
    // nama pemilik hanya menandai transfer/setoran (bukan bunga atau kata transaksi yang jelas)
    if (ownHit && best.rule.cat !== 'non' && best.rule.cat !== 'bunga' && !(best.rule.cat === 'usaha' && best.conf === 'tinggi')) return ownResult();
    // transfer/setoran generik + kata transaksi spesifik -> pakai yang spesifik
    const specific = pool.find((h) => h.rule.cat === best.rule.cat && h.conf === 'tinggi');
    if (specific) best = specific;
    // transfer/setoran generik tapi ada petunjuk "kas/internal" -> perlu dicek
    const ambig = pool.find((h) => h.rule.cat === 'cek');
    if (ambig && (best.rule.cat === 'cek' || (best.rule.cat === 'usaha' && best.conf !== 'tinggi'))) {
      return result('cek', ambig.rule.jenis, 'rendah', `${ambig.reason}; bisa penerimaan, bisa juga dana sendiri`);
    }
    if (best.rule.cat === 'cek') best = pool.find((h) => h.rule.cat !== 'cek') || best;
    // hanya petunjuk lemah -> perlu dicek, tapi tetap tampilkan tebakannya
    if (!strong.length) return result('cek', `Mungkin: ${best.rule.jenis}`, 'rendah', best.reason);
    const others = pool.filter((h) => h.rule.cat !== best.rule.cat && h.kind !== 'weak');
    const extra = others.length ? ` (juga ada ${others[0].reason} → ${CATS[others[0].rule.cat].toLowerCase()})` : '';
    return result(best.rule.cat, best.rule.jenis, best.conf, best.reason + extra);
  }

  function result(cat, jenis, conf, reason) {
    return { cat, label: CATS[cat], jenis, conf, reason };
  }

  const LEGAL = new Set(['PT', 'CV', 'TBK', 'UD', 'PD', 'FA', 'KOPERASI', 'YAYASAN', 'PERSERO', 'INDONESIA', 'BAPAK', 'IBU', 'SDR', 'SDRI', 'TN', 'NY', 'MR', 'MRS', 'BPK']);
  function ownerTokens(name) {
    return norm(name).split(' ').filter((t) => t.length >= 3 && !LEGAL.has(t) && !/^\d+$/.test(t));
  }

  // semua kata di kamus (bukan nama orang/perusahaan)
  const DICT = new Set();
  for (const r of RULES) for (const t of [...r.terms, ...r.abbr, ...r.weak]) for (const w of norm(t).split(' ')) DICT.add(w);
  const STOP = new Set(['TRSF', 'TRF', 'E', 'BANKING', 'CR', 'DB', 'DR', 'KR', 'BI', 'FAST', 'TANGGAL', 'TGL', 'KE', 'DARI', 'DR', 'OTOMATIS', 'TUNAI', 'VIA', 'NO', 'REF', 'ATM', 'TO', 'FROM', 'CS', 'CABANG', 'REK', 'REKENING', 'DANA', 'PAYOUT', 'ORDER', 'BLN', 'BULAN', 'UNTUK', 'UTK', 'ATAS', 'NAMA', 'AN', 'A', 'N', 'DAN', 'THE', 'OF', 'BANK', 'IDR', 'RP', 'BERITA', 'KET', 'NOTE']);
  const ENTITY = /^(PT|CV|UD|PD|TOKO|KOPERASI|YAYASAN|KOP|FA|TB|RS|APOTEK|BENGKEL)$/;

  /** Perkiraan nama pihak pengirim dari keterangan (untuk rekap per pihak). */
  function guessParty(desc) {
    // buang token yang mengandung angka (kode referensi, mis. "3011/FTSCY/WS95051", "INV0231")
    const cleaned = String(desc || '').split(/\s+/).filter((t) => !/\d/.test(t)).join(' ');
    const toks = norm(cleaned).split(' ').filter(Boolean);
    const isName = (t) => /^[A-Z]{2,}$/.test(t) && !DICT.has(t) && !STOP.has(t);
    // 1. badan usaha: "PT MAJU JAYA", "CV SINAR"
    for (let i = 0; i < toks.length; i++) {
      if (ENTITY.test(toks[i])) {
        const run = [];
        for (let j = i + 1; j < toks.length && run.length < 4 && isName(toks[j]); j++) run.push(toks[j]);
        if (run.length) return toks[i] + ' ' + run.join(' ');
      }
    }
    // 2. deret nama terpanjang (orang), maks 4 kata
    let best = [], cur = [];
    for (const t of toks) {
      if (isName(t) && !ENTITY.test(t)) { cur.push(t); if (cur.length > best.length || (cur.length === best.length && cur.join('').length > best.join('').length)) best = cur.slice(); }
      else cur = [];
    }
    if (!best.length || (best.length === 1 && best[0].length < 4)) return '';
    return best.slice(0, 4).join(' ');
  }

  /** Analisis semua uang masuk di dokumen rekening koran. Menambah r.inc pada baris kredit. */
  function analyze(doc, opts = {}) {
    const owner = opts.ownerName != null ? opts.ownerName : (doc.meta && doc.meta.name) || '';
    for (const r of doc.rows) {
      if (!r.kredit) { delete r.inc; continue; }
      if (r.inc && r.inc.manual) continue; // pilihan manual pengguna tidak ditimpa
      r.inc = classify(r.desc, { ownerName: owner, userRules: opts.userRules });
      r.inc.party = guessParty(r.desc);
    }
    return summarize([doc]);
  }

  /** Ringkasan untuk satu/lebih dokumen: per kategori, per bulan, per pihak. */
  function summarize(docs) {
    const byCat = {}, byMonth = new Map(), byParty = new Map();
    for (const c of CAT_ORDER) byCat[c] = { total: 0, count: 0 };
    for (const d of docs) for (const r of d.rows) {
      if (!r.kredit || !r.inc) continue;
      byCat[r.inc.cat].total += r.kredit; byCat[r.inc.cat].count++;
      const mk = r.date ? `${r.date.y}-${String(r.date.m).padStart(2, '0')}` : '(tanpa tanggal)';
      if (!byMonth.has(mk)) byMonth.set(mk, { usaha: 0, bunga: 0, non: 0, cek: 0, total: 0 });
      const m = byMonth.get(mk); m[r.inc.cat] += r.kredit; m.total += r.kredit;
      const pk = r.inc.party || '(tidak diketahui)';
      if (!byParty.has(pk)) byParty.set(pk, { total: 0, count: 0, cats: {} });
      const p = byParty.get(pk); p.total += r.kredit; p.count++; p.cats[r.inc.cat] = (p.cats[r.inc.cat] || 0) + r.kredit;
    }
    const round = (v) => Math.round(v * 100) / 100;
    for (const c of CAT_ORDER) byCat[c].total = round(byCat[c].total);
    return {
      byCat,
      months: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ key: k, ...v })),
      parties: [...byParty.entries()].map(([k, v]) => ({ party: k, ...v, mainCat: Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.total - a.total),
    };
  }

  return { CATS, CAT_ORDER, RULES, classify, analyze, summarize, guessParty, norm, _editDistance: editDistance };
});
