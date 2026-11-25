/*
 * ConPEx engine — parsing & checking logic (tanpa DOM).
 * Dipakai oleh halaman extension (app.js) dan oleh test di Node.
 *
 * Alur: kata-kata berposisi (dari pdf.js atau OCR) -> baris visual -> baris transaksi
 *       -> debit/kredit/saldo -> pengecekan (saldo per baris, total vs ringkasan, dll).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ConPExEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 0.005;
  const close = (a, b) => a != null && b != null && Math.abs(a - b) < EPS;
  const round2 = (v) => (v == null ? v : Math.round(v * 100) / 100);
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  // buang sisa garis/tanda baca liar hasil OCR di awal/akhir keterangan
  const tidy = (s) => clean(s).replace(/^[\s—–\-_|~.,:;'"`»«•]+(?=\S)/, '').replace(/\s[|_~—–]+$/, '').trim();

  const MONTHS = {
    jan: 1, januari: 1, january: 1, feb: 2, peb: 2, februari: 2, pebruari: 2, february: 2,
    mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6,
    jul: 7, juli: 7, july: 7, agu: 8, agt: 8, ags: 8, agus: 8, agustus: 8, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10,
    nov: 11, nop: 11, november: 11, nopember: 11, des: 12, dec: 12, desember: 12, december: 12,
  };
  const monthOf = (s) => MONTHS[String(s || '').toLowerCase().replace(/[^a-z]/g, '')] || null;

  const BANKS = [
    ['BCA', /\bBCA\b|bank central asia|klikbca|tahapan/i],
    ['Mandiri', /bank\s*mandiri|\bmandiri\b|livin|mcm\s*inhouse/i],
    ['BRI', /\bBRI\b|bank rakyat indonesia|britama|brimo/i],
    ['BNI', /\bBNI\b|bank negara indonesia|taplus/i],
    ['BSI', /\bBSI\b|bank syariah indonesia/i],
    ['CIMB Niaga', /cimb\s*niaga/i],
    ['Permata', /permata\s*bank|bank\s*permata/i],
    ['Danamon', /danamon/i],
    ['BTN', /\bBTN\b|bank tabungan negara/i],
    ['OCBC', /\bOCBC\b/i],
    ['Panin', /\bpanin\b/i],
    ['Maybank', /maybank/i],
    ['Bank Mega', /bank\s*mega/i],
    ['Bank Jago', /bank\s*jago/i],
  ];

  // ---------------------------------------------------------------- kata & baris

  /** items: [{str, x, y (baseline, dari atas), w, h}] dalam koordinat halaman */
  function wordsFromTextItems(items) {
    const out = [];
    for (const it of items) {
      const str = it.str;
      if (!str || !str.trim()) continue;
      const h = it.h || 8;
      const w = it.w || str.length * h * 0.5;
      const n = str.length;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(str))) {
        out.push({
          t: m[0],
          x0: it.x + (w * m.index) / n,
          x1: it.x + (w * (m.index + m[0].length)) / n,
          y0: it.y - h * 0.8,
          y1: it.y + h * 0.2,
          conf: 100,
        });
      }
    }
    return out;
  }

  /**
   * Kata dari Tesseract. Bisa berupa array words [{text,bbox,confidence}] atau objek data
   * Tesseract ({lines:[{words}]}). Dengan data lines, pengelompokan baris dari OCR dipakai
   * (lebih tahan terhadap scan yang miring).
   */
  function wordsFromOcr(src) {
    const conv = (w, ln) => ({ t: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, conf: w.confidence, ocr: true, ln });
    if (src && !Array.isArray(src) && Array.isArray(src.lines) && src.lines.length) {
      const out = [];
      src.lines.forEach((line, i) => (line.words || []).forEach((w) => { if (w.text && w.text.trim()) out.push(conv(w, i)); }));
      return out;
    }
    return (Array.isArray(src) ? src : (src && src.words) || []).filter((w) => w.text && w.text.trim()).map((w) => conv(w, w.ln));
  }

  /** Perbaiki salah baca OCR yang umum pada angka (O->0, l->1, S->5, ...). */
  function fixOcrNumber(t) {
    const m = t.match(/^(.*?)(\s*(?:DB|CR|DR|D|K|C))?$/i);
    let core = m[1];
    const suffix = m[2] || '';
    const digits = (core.match(/\d/g) || []).length;
    if (digits < 3 || digits / core.replace(/[.,\-+()]/g, '').length < 0.6) return { t, fixed: false };
    const fixedCore = core
      .replace(/[Oo]/g, '0').replace(/[lI|!]/g, '1').replace(/(?<=\d)[Ss](?=\d)/g, '5')
      .replace(/(?<=\d)B(?=\d)/g, '8').replace(/(?<=\d)Z(?=\d)/g, '2');
    return { t: fixedCore + suffix, fixed: fixedCore !== core };
  }

  function medianOf(arr, def) {
    if (!arr.length) return def;
    const s = arr.slice().sort((a, b) => a - b);
    return s[s.length >> 1];
  }

  function linesFromWords(words, page, pageW, isOcr) {
    if (!words.length) return [];
    const mh = medianOf(words.map((w) => w.y1 - w.y0), 10);
    const ws = words.map((w) => {
      let t = w.t, fixed = false;
      if (isOcr) {
        t = t.replace(/[“”"'`]/g, '');
        const f = fixOcrNumber(t);
        t = f.t; fixed = f.fixed;
      }
      return { ...w, t, fixed, cy: (w.y0 + w.y1) / 2 };
    }).filter((w) => w.t).sort((a, b) => a.cy - b.cy);
    const lines = [];
    let cur = null;
    if (ws.length && ws.every((w) => w.ln != null)) {
      // pakai baris hasil OCR; tapi pecah bila satu "baris" OCR ternyata berisi 2 baris yang bertumpuk
      const by = new Map();
      for (const w of ws) { if (!by.has(w.ln)) by.set(w.ln, []); by.get(w.ln).push(w); }
      for (const [, g] of by) {
        g.sort((a, b) => a.x0 - b.x0);
        // satu "baris" OCR kadang berisi 2 baris cetak yang berdekatan: pisahkan menurut tinggi kata,
        // dengan membandingkan ke kata terdekat di sebelah kiri (aman untuk scan miring)
        const subs = [];
        for (const w of g) {
          let best = null, bd = Infinity;
          for (const sb of subs) { const d = Math.abs(w.cy - sb.last.cy); if (d < bd) { bd = d; best = sb; } }
          if (best && bd <= mh * 0.6) { best.words.push(w); best.last = w; }
          else subs.push({ words: [w], last: w });
        }
        for (const sb of subs) lines.push({ page, cy: sb.words[0].cy, words: sb.words, h: mh, pageW });
      }
      lines.sort((a, b) => a.cy - b.cy);
    } else for (const w of ws) {
      if (cur && Math.abs(w.cy - cur.cy) <= mh * 0.45) {
        cur.words.push(w);
        cur.cy = (cur.cy * (cur.words.length - 1) + w.cy) / cur.words.length;
      } else {
        cur = { page, cy: w.cy, words: [w], h: mh, pageW };
        lines.push(cur);
      }
    }
    for (const l of lines) {
      l.words.sort((a, b) => a.x0 - b.x0);
      mergeNumberFragments(l);
      l.text = l.words.map((w) => w.t).join(' ');
      // teks dengan pemisah kolom (gap besar) -> "   "
      l.segText = l.words.reduce((s, w, i) => {
        if (i === 0) return w.t;
        const gap = w.x0 - l.words[i - 1].x1;
        return s + (gap > l.h * 1.2 ? '   ' : ' ') + w.t;
      }, '');
    }
    return lines;
  }

  function mergeNumberFragments(line) {
    const W = line.words;
    for (let i = 0; i < W.length - 1; i++) {
      const a = W[i], b = W[i + 1];
      const gap = b.x0 - a.x1;
      if (gap > line.h * 0.6) continue;
      if (/[\/:]/.test(a.t) || /[\/:]/.test(b.t)) continue;
      if (!/^[(\-+]?(rp\.?)?[\d.,]*\d[.,]?$/i.test(a.t)) continue;
      if (!/^[.,]?\d{1,3}(?:[.,]\d{1,3})*\)?(?:DB|CR|DR|D|K|C)?$/i.test(b.t)) continue;
      const joined = a.t + b.t;
      const p = parseAmount(joined);
      const pa = parseAmount(a.t);
      // gabung hanya jika hasil gabungan valid & lebih masuk akal (mis. "1.000" + "000,00")
      if (p && !p.suspicious && (p.grouped || p.decimals) && (!pa || pa.suspicious || /[.,]$/.test(a.t) || /^[.,]/.test(b.t) || (b.t.replace(/\D/g, '').length === 3 && pa.grouped))) {
        W.splice(i, 2, { ...a, t: joined, x1: b.x1, conf: Math.min(a.conf, b.conf), fixed: a.fixed || b.fixed, merged: true });
        i--;
      }
    }
  }

  // ---------------------------------------------------------------- angka & tanggal

  function parseAmount(raw) {
    let s = String(raw).trim();
    if (!s) return null;
    let neg = false, plus = false, flag = null;
    s = s.replace(/^(rp\.?|idr)\s*/i, '');
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    const fm = s.match(/(?<=[\d)])\s*(cr|db|dr|d|k|c)\.?$/i);
    if (fm) { flag = /^(cr|k|c)/i.test(fm[1]) ? 'C' : 'D'; s = s.slice(0, s.length - fm[0].length); }
    s = s.replace(/^(rp\.?|idr)\s*/i, '');
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.startsWith('-')) { neg = true; s = s.slice(1); } else if (s.startsWith('+')) { plus = true; s = s.slice(1); }
    if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); } else if (s.endsWith('+')) { plus = true; s = s.slice(0, -1); }
    s = s.replace(/\s/g, '');
    if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null;
    const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    let intPart = s, dec = '', suspicious = false;
    if (lastSep >= 0) {
      const after = s.length - lastSep - 1;
      if (after === 1 || after === 2) { intPart = s.slice(0, lastSep); dec = s.slice(lastSep + 1); }
      else if (after !== 3) return null;
    }
    const groups = intPart.split(/[.,]/);
    if (groups.length > 1) {
      if (!(groups[0].length >= 1 && groups[0].length <= 3 && groups.slice(1).every((g) => g.length === 3))) suspicious = true;
      const seps = new Set(intPart.replace(/\d/g, ''));
      if (seps.size > 1) suspicious = true;
      if (dec && seps.has(s[lastSep])) suspicious = true;
    }
    if (dec.length === 1) suspicious = true;
    const value = Number(groups.join('') + (dec ? '.' + dec.padEnd(2, '0') : '')) * (neg ? -1 : 1);
    if (!isFinite(value)) return null;
    // alternatif bila digit pertama kemungkinan tanda +/- yang salah baca (mis. "1974.600,50" dari "+974.600,50")
    let alt = null;
    if (groups.length > 1 && groups[0].length === 4 && !neg && !plus) alt = Number(groups[0].slice(1) + groups.slice(1).join('') + (dec ? '.' + dec.padEnd(2, '0') : ''));
    return { value, flag, neg, plus, decimals: dec.length, grouped: groups.length > 1, suspicious, alt };
  }

  function validDate(d, m, y) {
    return d >= 1 && d <= 31 && m >= 1 && m <= 12 && (y == null || (y >= 1990 && y <= 2100));
  }
  const yy = (y) => (y == null ? null : y < 100 ? 2000 + y : y);

  /** Cocokkan tanggal mulai dari kata ke-i. Return {d,m,y,n} (n = jumlah kata terpakai). */
  function matchDate(words, i) {
    const w = words[i] && words[i].t.replace(/[,;]$/, '');
    if (!w) return null;
    let m;
    if ((m = w.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})$/))) {
      const r = { d: +m[1], m: +m[2], y: yy(+m[3]), n: 1 };
      return validDate(r.d, r.m, r.y) ? r : null;
    }
    if ((m = w.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/))) {
      const r = { d: +m[3], m: +m[2], y: +m[1], n: 1 };
      return validDate(r.d, r.m, r.y) ? r : null;
    }
    if ((m = w.match(/^(\d{1,2})[\/\-](\d{1,2})$/))) {
      const r = { d: +m[1], m: +m[2], y: null, n: 1 };
      return validDate(r.d, r.m) ? r : null;
    }
    if ((m = w.match(/^(\d{1,2})[\-\/.]?([A-Za-z]{3,9})[\-\/.]?(\d{4}|\d{2})?$/)) && monthOf(m[2])) {
      const r = { d: +m[1], m: monthOf(m[2]), y: m[3] ? yy(+m[3]) : null, n: 1 };
      if (!m[3] && words[i + 1] && /^\d{4}$/.test(words[i + 1].t)) { r.y = +words[i + 1].t; r.n = 2; }
      return validDate(r.d, r.m, r.y) ? r : null;
    }
    if (/^\d{1,2}$/.test(w) && words[i + 1] && monthOf(words[i + 1].t) && /^[A-Za-z]{3,9}\.?$/.test(words[i + 1].t)) {
      const r = { d: +w, m: monthOf(words[i + 1].t), y: null, n: 2 };
      const w3 = words[i + 2] && words[i + 2].t.replace(/[,;]$/, '');
      if (w3 && /^(\d{4}|\d{2})$/.test(w3)) { r.y = yy(+w3); r.n = 3; }
      return validDate(r.d, r.m, r.y) ? r : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- header kolom

  const HDR = [
    ['flag', /^(db\/cr|cr\/db|d\/k|k\/d|dk|d\/c|dbcr|db\/kr|dr\/cr)$/],
    ['date', /^(tanggal|tgl|date|valuta|posting|effective|tgl\/jam|value)$/],
    ['desc', /^(keterangan|uraian|description|remarks?|deskripsi|transaction|transaksi|details?|narasi|memo|descriptions?)$/],
    ['debit', /^(debit|debet|debits|withdrawals?|penarikan|keluar|db|dr)$/],
    ['credit', /^(kredit|credit|credits|deposits?|setoran|masuk|cr)$/],
    ['amount', /^(mutasi|amount|jumlah|nominal|nilai|mutation)$/],
    ['saldo', /^(saldo|balance)$/],
    ['ref', /^(bukti|voucher|ref|referensi|reference|jurnal|journal|sumber|source|cek|cheque|no\.bukti|nobukti|trans\.?no)$/],
    ['branch', /^(cbg|cabang|branch|teller|kode)$/],
  ];
  const AMT_COLS = new Set(['debit', 'credit', 'amount', 'saldo']);
  const NOT_HEADER = /saldo\s*(awal|akhir)|total|dana\s*(masuk|keluar)|opening|closing|beginning|ending|sub\s*total|jumlah\s*transaksi/i;

  function headerGroup(t) {
    const k = t.toLowerCase().replace(/[():.,]/g, (c) => (c === '.' ? '.' : '')).replace(/\.$/, '');
    for (const [g, re] of HDR) if (re.test(k)) return g;
    return null;
  }

  function headerLabels(words, h) {
    const labels = [];
    let prefix = null;
    for (let w of words) {
      const g = headerGroup(w.t);
      if (!g) { prefix = /^(no\.?|nomor|kode|nomer|#)$/i.test(w.t) ? w : null; continue; }
      if (prefix && w.x0 - prefix.x1 < h * 1.2) w = { ...w, x0: prefix.x0, t: prefix.t + ' ' + w.t };
      prefix = null;
      const last = labels[labels.length - 1];
      const near = last && w.x0 - last.x1 < h * 1.2 && Math.abs(w.cy - last.cy) < h * 0.8;
      if (near && (last.g === g || (last.g === 'amount' && (g === 'debit' || g === 'credit')) ||
          ((last.g === 'date' || last.g === 'desc') && /^(transaksi|transaction)$/i.test(w.t)) ||
          (last.g === 'ref' && g === 'ref'))) {
        if (last.g === 'amount') last.g = g;
        last.x1 = w.x1; last.text += ' ' + w.t;
        continue;
      }
      labels.push({ g, x0: w.x0, x1: w.x1, cy: w.cy, text: w.t });
    }
    // gabungkan label yg bertumpuk vertikal (header 2 baris) dengan posisi x sama
    labels.sort((a, b) => a.x0 - b.x0);
    for (const L of labels) L.cx = (L.x0 + L.x1) / 2;
    return labels;
  }

  function scoreHeader(labels) {
    const gs = new Set(labels.map((l) => l.g));
    const hasMoney = gs.has('saldo') || gs.has('amount') || (gs.has('debit') && gs.has('credit'));
    if (!hasMoney || labels.length < 3) return 0;
    if (!(gs.has('date') || gs.has('desc'))) return 0;
    return gs.size + (gs.has('saldo') ? 1 : 0) + (gs.has('debit') && gs.has('credit') ? 1 : 0);
  }

  function detectHeader(L, next) {
    if (NOT_HEADER.test(L.text)) return null;
    if (L.words.some((w) => isMoneyWord(w.t))) return null;
    let labels = headerLabels(L.words, L.h);
    let score = scoreHeader(labels);
    let usedNext = false;
    if (next && next.page === L.page && next.cy - L.cy < L.h * 1.8 && !NOT_HEADER.test(next.text) && !next.words.some((w) => isMoneyWord(w.t))) {
      const nl = headerLabels(next.words, next.h);
      if (nl.length) {
        // header 2 baris: label baris bawah menggantikan label baris atas yang posisinya bertumpuk
        const combined = labels.filter((a) => !nl.some((b) => b.x0 < a.x1 + L.h && b.x1 > a.x0 - L.h && (a.g === 'amount' || a.g === b.g)))
          .concat(nl).sort((a, b) => a.x0 - b.x0);
        const s2 = scoreHeader(combined);
        if (s2 > score) { labels = combined; score = s2; usedNext = true; }
      }
    }
    if (!score) return null;
    return { labels, usedNext, page: L.page };
  }

  function isMoneyWord(t) {
    const p = parseAmount(t);
    return !!(p && (p.grouped || p.decimals > 0));
  }

  function nearestAmountCol(w, header) {
    let best = null, bd = Infinity;
    for (const L of header.labels) {
      const d = Math.min(Math.abs(w.x1 - L.x1), Math.abs((w.x0 + w.x1) / 2 - L.cx), Math.abs(w.x0 - L.x0));
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }

  function textCol(w, header, h) {
    let col = null;
    for (const L of header.labels) if (L.x0 - h * 0.8 <= w.x0) col = L;
    return col || header.labels[0];
  }

  // ---------------------------------------------------------------- label ringkasan

  const D_ = 'd[eé]?b[ei]t';
  const SUM_LABELS = [
    ['opening', new RegExp('(saldo\\s*awal|opening\\s*balance|beginning\\s*balance|saldo\\s*sebelumnya|previous\\s*balance|saldo\\s*lalu|saldo\\s*pindahan|brought\\s*forward|balance\\s*b\\/f)', 'g')],
    ['closing', /(saldo\s*akhir|closing\s*balance|ending\s*balance|saldo\s*penutup(an)?|carried\s*forward)/g],
    ['debit', new RegExp('(total\\s*(mutasi\\s*|transaksi\\s*)?' + D_ + 's?|jumlah\\s*(mutasi\\s*)?' + D_ + '|mutasi\\s*(' + D_ + '|db)|dana\\s*keluar|total\\s*penarikan|total\\s*withdrawals?|total\\s*db|total\\s*dr)', 'g')],
    ['credit', /(total\s*(mutasi\s*|transaksi\s*)?(kredit|credits?)|jumlah\s*(mutasi\s*)?(kredit|credit)|mutasi\s*(kredit|credit|cr)|dana\s*masuk|total\s*setoran|total\s*deposits?|total\s*cr)/g],
    ['total', /^(grand\s*total|total\s*keseluruhan|sub\s*total|subtotal|total\s*mutasi|total\s*akun|total|jumlah)\b/g],
  ];

  /** Cari label ringkasan di baris. Return [{lab, wi, wiEnd}] urut posisi kata. */
  function findLabels(words) {
    let text = '', starts = [];
    words.forEach((w, i) => { if (i) text += ' '; starts.push(text.length); text += w.t.toLowerCase(); });
    const found = [];
    for (const [lab, re] of SUM_LABELS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const s = m.index, e = m.index + m[0].length;
        let wi = starts.findIndex((st, i) => st <= s && (i === starts.length - 1 || starts[i + 1] > s));
        let wiEnd = starts.findIndex((st) => st >= e);
        if (wiEnd < 0) wiEnd = words.length;
        if (!found.some((f) => wi < f.wiEnd && wiEnd > f.wi)) found.push({ lab, wi, wiEnd, x0: words[wi].x0, x1: words[wiEnd - 1].x1, grand: /grand|keseluruhan/.test(m[0]) });
        if (!re.global) break;
      }
    }
    return found.sort((a, b) => a.wi - b.wi);
  }

  const NOISE = /(halaman|page)\s*:?\s*\d+(\s*(dari|of|\/)\s*\d+)?|bersambung|continued|dicetak\s*(pada|oleh)|printed\s*(on|by)|^\s*\d+\s*\/\s*\d+\s*$|lembar\s*\d+|informasi\s*lainnya|terima\s*kasih|this\s*is\s*a\s*computer|tidak\s*memerlukan\s*tanda\s*tangan|^[-=_.\s]{5,}$/i;
  const TIME = /^\d{1,2}:\d{2}(:\d{2})?$/;

  // ---------------------------------------------------------------- deteksi dok

  function detectBank(lines) {
    let best = null, bs = 0;
    // kop dokumen: baris di halaman pertama sebelum baris pertama yang berisi nominal uang
    const p1 = lines.filter((l) => l.page === lines[0].page);
    const firstMoney = p1.findIndex((l) => l.words.some((w) => isMoneyWord(w.t)));
    const head = p1.slice(0, Math.min(18, firstMoney < 0 ? 18 : Math.max(firstMoney, 3))).map((l) => l.text).join('\n');
    const all = lines.map((l) => l.text).join('\n');
    for (const [name, re] of BANKS) {
      const g = new RegExp(re.source, 'gi');
      const s = (head.match(g) || []).length * 10 + (all.match(g) || []).length;
      if (s > bs) { bs = s; best = name; }
    }
    return best || 'Lainnya';
  }

  function detectDocType(text) {
    const gl = (text.match(/buku\s*besar|general\s*ledger|kode\s*akun|no\.?\s*akun|nama\s*akun|perkiraan|no\.?\s*bukti|voucher|jurnal|ledger|account\s*code/gi) || []).length;
    const bank = (text.match(/rekening\s*koran|mutasi\s*rekening|account\s*statement|statement\s*of\s*account|e-?statement|laporan\s*transaksi|nomor\s*rekening|no\.?\s*rekening|account\s*no|tahapan|tabungan|giro|\bbank\b/gi) || []).length;
    return gl > bank ? 'gl' : 'bank';
  }

  function extractMeta(lines) {
    const meta = { accountNo: '', name: '', period: '', currency: '', company: '' };
    const firstPage = lines.length ? lines[0].page : 1;
    const pool = lines.filter((l) => l.page === firstPage).slice(0, 40);
    const kv = [];
    for (const l of pool) {
      const segs = l.segText.split(/\s{3,}/);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        let m = s.match(/^([^:]{2,40}?)\s*:\s*(.*)$/);
        if (m) {
          let val = m[2].trim();
          if (!val && segs[i + 1] && !/:/.test(segs[i + 1])) { val = segs[i + 1]; i++; }
          kv.push([m[1].trim(), val]);
        } else if (/^:\s*/.test(segs[i + 1] || '')) {
          kv.push([s.trim(), segs[i + 1].replace(/^:\s*/, '')]); i++;
        }
      }
    }
    for (const [k, v] of kv) {
      const kl = k.toLowerCase();
      if (!meta.accountNo && /(no\.?|nomor|number|nomer)\s*(rek|account|a\/c)|rekening|account\s*no/.test(kl) && /\d{5,}/.test(v.replace(/[\s\-.]/g, ''))) meta.accountNo = (v.match(/[\d][\d\-\s.]*\d/) || [v])[0].trim();
      else if (!meta.name && /^(nama|name|account\s*name|nama\s*nasabah|nama\s*rekening)/.test(kl) && /[a-z]/i.test(v)) meta.name = v;
      else if (!meta.period && /periode|period|tanggal\s*laporan|statement\s*date/.test(kl)) meta.period = v;
      else if (!meta.currency && /mata\s*uang|currency/.test(kl)) meta.currency = v;
    }
    if (!meta.period) {
      const t = pool.map((l) => l.text).join(' ');
      const m = t.match(/(periode|period)\s*:?\s*([^\n]{4,60})/i);
      if (m) meta.period = clean(m[2]).slice(0, 60);
    }
    if (!meta.accountNo) {
      const t = pool.map((l) => l.text).join(' ');
      const m = t.match(/(?:no\.?\s*rek(?:ening)?|nomor\s+rekening|account\s+(?:no|number)\.?)\s*[:.]?\s*(\d[\d\-\s]{5,}\d)/i);
      if (m) meta.accountNo = m[1].trim();
    }
    return meta;
  }

  /** Tahun default untuk tanggal tanpa tahun (mis. BCA "01/11"). */
  function yearContext(meta, lines) {
    const ym = [];
    const scan = (s) => {
      let m;
      const re1 = /([A-Za-z]{3,9})\.?\s+(\d{4})/g;
      while ((m = re1.exec(s))) if (monthOf(m[1])) ym.push({ m: monthOf(m[1]), y: +m[2] });
      const re2 = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
      while ((m = re2.exec(s))) if (validDate(+m[1], +m[2], +m[3])) ym.push({ m: +m[2], y: +m[3] });
      const re3 = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/g;
      while ((m = re3.exec(s))) if (monthOf(m[2])) ym.push({ m: monthOf(m[2]), y: +m[3] });
    };
    if (meta.period) scan(meta.period);
    if (!ym.length) scan(lines.slice(0, 40).map((l) => l.text).join(' '));
    if (!ym.length) { const y = new Date().getFullYear(); return { start: { m: 1, y }, end: { m: 12, y } }; }
    return { start: ym[0], end: ym[ym.length - 1] };
  }

  function resolveYear(d, yc) {
    if (d.y) return d.y;
    if (yc.start.y !== yc.end.y) return d.m >= yc.start.m ? yc.start.y : yc.end.y;
    return yc.end.y;
  }

  // ---------------------------------------------------------------- akun buku besar

  function matchAccount(L) {
    const t = L.text;
    let m = t.match(/^(?:no\.?\s*|kode\s*|nomor\s*)?(?:akun|account|perkiraan|acc\.?|coa|rekening)\s*(?:no\.?|code|kode)?\s*[:.]?\s*([0-9][0-9A-Za-z.\-\/]*)\s*[-:–]?\s*(.*)$/i);
    if (m && !/^nama/i.test(t)) return { code: m[1], name: clean(m[2]).replace(/^(nama\s*(akun|account)?\s*:?\s*)/i, '') };
    m = t.match(/^\[?([0-9]{1,2}[0-9.\-]{2,}[0-9])\]?\s*[-:–]?\s+([A-Za-z][^\d]{1,80})$/);
    if (m && !/^\d{1,2}[\/\-]\d{1,2}/.test(m[1])) return { code: m[1], name: clean(m[2]), weak: true };
    return null;
  }

  // ---------------------------------------------------------------- klasifikasi kata

  function classify(L, header, ctx) {
    const W = L.words;
    const out = { date: null, amounts: [], desc: [], ref: [], dateWords: 0, preText: '' };
    let start = 0;
    let d = matchDate(W, 0);
    if (!d && W.length > 1 && /^\d{1,4}\.?$/.test(W[0].t)) { d = matchDate(W, 1); if (d) start = 1; }
    let midDate = false, dateFixed = false;
    if (!d && ctx.ddmm && W[0] && W[0].ocr && W.length > 2) {
      // OCR sering menghilangkan "/" pada tanggal dd/mm: "21/11" -> "2111" atau "21711"
      const m = W[0].t.match(/^(\d{2})[71l|]?(\d{2})$/);
      if (m && validDate(+m[1], +m[2]) && W.slice(1).some((w) => isMoneyWord(w.t)) && ctx.months && ctx.months.has(+m[2])) {
        d = { d: +m[1], m: +m[2], y: null, n: 1 }; dateFixed = true;
      }
    }
    if (!d) {
      // tanggal tidak di awal: cari di beberapa kata pertama, asal masih di paruh kiri halaman
      // dan setelahnya ada angka uang (kolom identitas spt Cifno/Nama/No Rek di depan dilewati)
      for (let i = 1; i < Math.min(W.length - 1, 12); i++) {
        if (W[i].x0 > L.pageW * 0.6) break;
        const dd = matchDate(W, i);
        if (dd && dd.y && W.slice(i + dd.n).some((w) => isMoneyWord(w.t))) { d = dd; start = i; midDate = true; break; }
      }
    }
    if (d) {
      const w0 = W[start];
      let ok = true;
      if (header) {
        const dateCols = header.labels.filter((l) => l.g === 'date');
        if (dateCols.length) ok = w0.x0 < dateCols[dateCols.length - 1].x1 + L.h * 4 || midDate;
        else ok = w0.x0 < L.pageW * 0.45;
      } else ok = w0.x0 < L.pageW * (midDate ? 0.6 : 0.45);
      if (ok) { out.date = d; out.dateWords = start + d.n; out.midDate = midDate; out.dateFixed = dateFixed; out.pre = midDate ? W.slice(0, start).map((w) => w.t) : null; }
    }
    const firstIdx = out.date ? out.dateWords : 0;
    let lastAmt = null, pendingFlag = null;
    for (let i = firstIdx; i < W.length; i++) {
      const w = W[i];
      const t = w.t;
      if (TIME.test(t) || /^(wib|wita|wit)$/i.test(t)) continue;
      if (/^(rp\.?|idr)$/i.test(t)) continue;
      const p = parseAmount(t);
      const amtCol = header ? nearestAmountCol(w, header) : null;
      const txtCol = header ? textCol(w, header, L.h) : null;
      const plainOk = header && amtCol && AMT_COLS.has(amtCol.g) && txtCol && AMT_COLS.has(txtCol.g) && /^[(\-+]?\d{1,15}[)\-+]?$/.test(t);
      const looksMoney = p && (p.grouped || p.decimals > 0 || plainOk);
      let accept = false;
      if (looksMoney) {
        if (!header) accept = true;
        else if (AMT_COLS.has(amtCol.g)) {
          if (AMT_COLS.has(txtCol.g) || txtCol.g === 'flag') accept = true;
          else {
            // angka rata-kanan yang panjang bisa "mulai" di kolom teks sebelah kirinya
            const nx = header.labels[header.labels.indexOf(txtCol) + 1];
            if (nx && (AMT_COLS.has(nx.g) || nx.g === 'flag') && w.x1 > nx.x0 - L.h * 0.5) accept = true;
          }
        }
      }
      if (accept) {
        lastAmt = { v: p.value, flag: p.flag, neg: p.neg, plus: p.plus, col: amtCol ? amtCol.g : null, x0: w.x0, x1: w.x1, wi: i, sus: !!(p.suspicious || w.fixed || (w.conf != null && w.conf < 70)), dec: p.decimals, alt: p.alt, raw: t };
        out.amounts.push(lastAmt);
        continue;
      }
      if (L.flagX != null && out.date && !lastAmt && Math.abs(w.x0 - L.flagX) < L.h * 1.2 && t.length <= 4 && !isMoneyWord(t)) {
        // kode C/D di kolomnya; OCR kadang membacanya jadi "(cd", "Cc", "et", "€"
        const f = /^[(\[{]?[cCkK€]/.test(t) ? 'C' : /^[(\[{]?[dD]/.test(t) ? 'D' : null;
        if (f && !pendingFlag) pendingFlag = f;
        continue;
      }
      if (w.ocr && !lastAmt && (/^[^\p{L}\p{N}]+$/u.test(t) || (t.length <= 3 && w.conf < 45) || (t.length <= 2 && /^[^A-Za-z]+$/.test(t) && w.conf < 70))) continue; // bercak/watermark
      if (w.ocr && lastAmt && (/^[^\p{L}\p{N}]+$/u.test(t) || (t.length <= 3 && w.conf < 45 && !/^(db|cr|dr|d|k|c)$/i.test(t)))) continue;
      if (!lastAmt && /^\(?(C|D|K)\)?$/.test(t) && out.date && (!txtCol || txtCol.g === 'flag' || txtCol.g === 'desc' || txtCol.g === 'date')) {
        // kolom "Jenis Trans" (C/D) yang letaknya sebelum angka
        if (!pendingFlag) { pendingFlag = /^\(?(C|K|CR)\)?$/.test(t) ? 'C' : 'D'; continue; }
      }
      if (/^(db|cr|dr|d|k|c|debet|debit|kredit|credit)$/i.test(t) && (lastAmt || (txtCol && txtCol.g === 'flag'))) {
        const target = out.amounts.slice().reverse().find((a) => a.col === 'amount') || lastAmt;
        if (target && (txtCol && txtCol.g === 'flag' || (lastAmt && w.x0 - lastAmt.x1 < L.h * 2.5))) {
          target.flag = /^(cr|k|c|kredit|credit)$/i.test(t) ? 'C' : 'D';
          continue;
        }
      }
      if (header && txtCol) {
        if (txtCol.g === 'date' && (matchDate(W, i) || /^\d{1,2}[\/\-]/.test(t))) continue;
        if (txtCol.g === 'ref' || txtCol.g === 'branch') { out.ref.push(w); continue; }
      }
      out.desc.push(w);
    }
    if (pendingFlag && out.amounts.length) {
      const tgt = out.amounts.find((x) => x.col === 'amount') || (out.amounts.some((x) => x.col) ? null : out.amounts.slice().sort((p, q) => p.x0 - q.x0)[0]);
      if (tgt && !tgt.flag) tgt.flag = pendingFlag;
    } else if (pendingFlag && !out.amounts.length) {
      out.desc.push({ t: pendingFlag === 'C' ? 'C' : 'D' }); // bukan kode arah ternyata; kembalikan ke keterangan
    }
    out.pendingFlag = pendingFlag;
    const firstAmtIdx = out.amounts.length ? out.amounts[0].wi : W.length;
    out.preText = W.slice(firstIdx, firstAmtIdx).map((w) => w.t).join(' ');
    return out;
  }

  // ---------------------------------------------------------------- parse utama

  let ROW_ID = 1;

  /**
   * pages: [{page, words, width, height, ocr}]
   * opts : {docType:'auto'|'bank'|'gl', bank:'auto'|nama, fileName}
   */
  function parse(pages, opts = {}) {
    const lines = [];
    for (const p of pages) lines.push(...linesFromWords(p.words, p.page, p.width, p.ocr));
    // kolom kode arah (C/D) yang berdiri sendiri: cari posisinya per halaman
    const flagCols = new Map();
    for (const l of lines) {
      const W = l.words;
      const di = W.findIndex((w, i) => i < 12 && matchDate(W, i));
      if (di < 0) continue;
      for (let i = di + 1; i < W.length; i++) if (/^(C|D|K)$/.test(W[i].t) && (W[i].conf == null || W[i].conf >= 75)) {
        if (!flagCols.has(l.page)) flagCols.set(l.page, []);
        flagCols.get(l.page).push(W[i].x0);
        break;
      }
    }
    for (const l of lines) { const xs = flagCols.get(l.page); if (xs && xs.length >= 3) l.flagX = medianOf(xs, null); }
    const text = lines.map((l) => l.text).join('\n');
    const docType = opts.docType && opts.docType !== 'auto' ? opts.docType : detectDocType(text);
    const bank = docType === 'bank' ? (opts.bank && opts.bank !== 'auto' ? opts.bank : lines.length ? detectBank(lines) : 'Lainnya') : '';
    const meta = extractMeta(lines);
    const yc = yearContext(meta, lines);
    const ctx = { docType, bank, yc };
    // format tanggal dominan & bulan-bulan yang muncul (untuk memulihkan tanggal yang rusak di OCR)
    {
      let dm = 0, other = 0;
      const months = new Set();
      for (const l of lines) {
        const t = l.words[0] && l.words[0].t;
        if (!t) continue;
        const dd = matchDate(l.words, 0);
        if (!dd) continue;
        months.add(dd.m);
        if (/^\d{1,2}\/\d{1,2}$/.test(t)) dm++; else other++;
      }
      ctx.ddmm = dm >= 3 && dm > other;
      ctx.months = months;
    }

    const rows = [];
    const summary = {}; // bank: opening, closing, debit, credit, debitCount, creditCount
    const accounts = [];
    let acct = null;
    let header = null;
    let cur = null, lastLine = null, page = null;
    let pendingLabels = null; // label ringkasan tanpa angka (nilai di baris bawahnya)
    const grand = {};

    const ensureAcct = () => {
      if (!acct) { acct = { code: '', name: '(Tanpa akun)', opening: null, printed: {} }; accounts.push(acct); }
      return acct;
    };

    const assignSummary = (lab, amts, count, isGrand, L) => {
      if (!amts.length) return;
      const vals = amts.map((a) => a.v);
      if (docType === 'gl') {
        const target = isGrand || !acct ? grand : ensureAcct().printed;
        if (lab === 'opening') { if (!isGrand) ensureAcct().opening = signedSaldo(amts[amts.length - 1]); else grand.opening = vals[0]; }
        else if (lab === 'closing') target.closing = signedSaldo(amts[amts.length - 1]);
        else if (lab === 'debit') target.debit = Math.abs(vals[0]);
        else if (lab === 'credit') target.credit = Math.abs(vals[0]);
        else if (lab === 'total') {
          const byCol = colMap(amts);
          if (byCol.debit != null || byCol.credit != null) { if (byCol.debit != null) target.debit = Math.abs(byCol.debit.v); if (byCol.credit != null) target.credit = Math.abs(byCol.credit.v); if (byCol.saldo != null) target.closing = signedSaldo(byCol.saldo); }
          else if (amts.length >= 2) { target.debit = Math.abs(vals[0]); target.credit = Math.abs(vals[1]); if (amts.length >= 3) target.closing = signedSaldo(amts[2]); }
        }
        return;
      }
      const note = (key, a) => { if (a && (a.sus || a.raw)) { summary._raw = summary._raw || {}; summary._raw[key] = { raw: a.raw, sus: a.sus }; } };
      if (lab === 'opening') note('opening', amts[amts.length - 1]); else if (lab === 'closing') note('closing', amts[amts.length - 1]); else if (lab === 'debit' || lab === 'credit') note(lab, amts[0]);
      if (lab === 'opening') { if (summary.opening == null) summary.opening = amts[amts.length - 1].v; }
      else if (lab === 'closing') summary.closing = amts[amts.length - 1].v;
      else if (lab === 'debit') { summary.debit = Math.abs(vals[0]); if (count != null) summary.debitCount = count; }
      else if (lab === 'credit') { summary.credit = Math.abs(vals[0]); if (count != null) summary.creditCount = count; }
      else if (lab === 'total') {
        const byCol = colMap(amts);
        if (byCol.debit) summary.debit = Math.abs(byCol.debit.v);
        if (byCol.credit) summary.credit = Math.abs(byCol.credit.v);
        if (!byCol.debit && !byCol.credit && amts.length >= 2) { summary.debit = Math.abs(vals[0]); summary.credit = Math.abs(vals[1]); }
      }
    };

    const newRow = (L, cls, dateOverride) => {
      const d = dateOverride || cls.date;
      const r = {
        id: ROW_ID++, page: L.page, file: opts.fileName || '',
        date: d ? { d: d.d, m: d.m, y: resolveYear(d, yc) } : null,
        ref: cls.ref.map((w) => w.t).join(' '),
        desc: tidy(cls.desc.map((w) => w.t).join(' ')),
        raw: cls.amounts.slice(), debit: null, kredit: null, saldo: null,
        sus: {}, notes: [], kind: 'tx',
      };
      if (dateOverride) r.notes.push('Tanggal disalin dari baris sebelumnya');
      if (cls.pre) r._pre = cls.pre.join(' ');
      if (cls.dateFixed) r.notes.push(`Tanggal dibaca OCR sebagai "${L.words[0].t}", diperbaiki jadi ${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}`);
      if (docType === 'gl') { const a = ensureAcct(); r.account = a.code; r.accountName = a.name; r.acct = a; }
      return r;
    };

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L.page !== page) { page = L.page; cur = null; lastLine = null; pendingLabels = null; }

      const hdr = detectHeader(L, lines[i + 1]);
      if (hdr) { header = hdr; if (hdr.usedNext) i++; cur = null; lastLine = null; continue; }
      if (NOISE.test(L.text) && !L.words.some((w) => isMoneyWord(w.t))) continue;

      const cls = classify(L, header, ctx);

      // akun buku besar
      if (docType === 'gl' && !cls.amounts.length) {
        const nm = L.text.match(/^nama\s*(akun|account|perkiraan)\s*[:.]?\s*(.+)$/i);
        if (nm && acct && (!acct.name || acct.name === '(Tanpa akun)' || acct.nameFromCode)) { acct.name = clean(nm[2]); acct.nameFromCode = false; continue; }
        if (!cls.date) {
          const a = matchAccount(L);
          const gapOk = !lastLine || L.cy - lastLine.cy > L.h * 1.6 || !cur;
          if (a && (!a.weak || gapOk)) {
            acct = { code: a.code, name: a.name || '', opening: null, printed: {} };
            accounts.push(acct); cur = null; lastLine = null;
            continue;
          }
        }
      }

      // label ringkasan
      const labs = findLabels(L.words);
      if (labs.length && (!cls.date || (labs[0].wi <= cls.dateWords + 1 && (labs[0].lab === 'opening' || labs[0].lab === 'closing')))) {
        if (labs[0].wi <= (cls.date ? cls.dateWords + 1 : 1)) {
          // blok ringkasan sering di luar grid tabel: baca angkanya tanpa acuan kolom,
          // kecuali baris "Total" yang memang mengikuti kolom debit/kredit
          if (labs[0].lab !== 'total') { const free = classify(L, null, ctx); if (free.amounts.length) cls.amounts = free.amounts; }
          if (cls.amounts.length) {
            labs.forEach((lb, k) => {
              const endWi = k + 1 < labs.length ? labs[k + 1].wi : Infinity;
              let amts = cls.amounts.filter((a) => a.wi >= lb.wiEnd && a.wi < endWi);
              if (!amts.length && labs.length === 1) amts = cls.amounts;
              let count = null;
              if (amts.length) {
                const after = L.words.slice(amts[amts.length - 1].wi + 1, endWi === Infinity ? undefined : endWi).find((w) => /^\d{1,5}$/.test(w.t));
                if (after) count = +after.t;
              }
              assignSummary(lb.lab, amts, count, lb.grand, L);
            });
            pendingLabels = null;
          } else if (labs.length >= 1) {
            pendingLabels = { labs, cy: L.cy, page: L.page };
          }
          cur = null; lastLine = null;
          continue;
        }
      }
      // nilai ringkasan di bawah label (mis. BRI/Mandiri)
      const freeVals = pendingLabels && !cls.date && L.cy - pendingLabels.cy < L.h * 3.5 ? classify(L, null, ctx) : null;
      if (freeVals && freeVals.amounts.length) {
        for (const a of freeVals.amounts) {
          let best = null, bd = Infinity;
          for (const lb of pendingLabels.labs) { const dd = Math.abs((a.x0 + a.x1) / 2 - (lb.x0 + lb.x1) / 2); if (dd < bd) { bd = dd; best = lb; } }
          if (best) assignSummary(best.lab, [a], null, best.grand, L);
        }
        const counts = L.words.filter((w) => /^\d{1,5}$/.test(w.t));
        pendingLabels = null; cur = null; lastLine = null;
        continue;
      }
      if (pendingLabels && L.cy - pendingLabels.cy >= L.h * 3.5) pendingLabels = null;

      if (cls.date) {
        cur = newRow(L, cls);
        rows.push(cur); lastLine = L;
        continue;
      }
      if (cur && lastLine && L.cy - lastLine.cy <= L.h * 2.4) {
        if (cls.amounts.length && cur.raw.length && (cls.desc.length || cls.amounts.length >= 1)) {
          cur = newRow(L, cls, cur.date ? { ...cur.date } : null);
          rows.push(cur); lastLine = L;
          continue;
        }
        const extra = cls.desc.map((w) => w.t).join(' ');
        if (extra) cur.desc = tidy(cur.desc + ' ' + extra);
        if (cls.ref.length) cur.ref = clean(cur.ref + ' ' + cls.ref.map((w) => w.t).join(' '));
        if (cls.amounts.length) cur.raw.push(...cls.amounts);
        lastLine = L;
        continue;
      }
      // di luar tabel: abaikan (kop surat, alamat, dll)
    }

    // pecah baris "saldo awal" yang bertanggal
    const txRows = [];
    let openingRow = null;
    for (const r of rows) {
      const isOpen = /^(saldo\s*awal|opening\s*balance|beginning\s*balance|saldo\s*sebelumnya|saldo\s*lalu|saldo\s*pindahan|previous\s*balance)/i.test(r.desc);
      const isClose = /^(saldo\s*akhir|closing\s*balance|ending\s*balance)/i.test(r.desc);
      if ((isOpen || isClose) && r.raw.length) {
        const a = r.raw[r.raw.length - 1];
        if (docType === 'gl') { if (isOpen) { if (r.acct.opening == null) r.acct.opening = signedSaldo(a); } else r.acct.printed.closing = signedSaldo(a); }
        else if (isOpen) { if (openingRow == null) openingRow = a.v; }
        else summary.closing = a.v;
        continue;
      }
      txRows.push(r);
    }
    if (docType === 'bank' && summary.opening == null && openingRow != null) summary.opening = openingRow;
    // format korporat: kolom identitas (Cifno, Nama, No Rek) berulang di tiap baris -> isi meta
    if (docType === 'bank' && (!meta.accountNo || !meta.name)) {
      const pres = txRows.map((r) => r._pre).filter(Boolean);
      if (pres.length >= 3) {
        const toks = pres.map((p) => p.split(' '));
        const nums = toks.flat().filter((t) => /^\d{10,16}$/.test(t));
        const count = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
        const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
        const tn = top(count(nums.filter((t) => t.length >= 10)));
        if (!meta.accountNo && tn && tn[1] >= pres.length * 0.6) {
          // nomor rekening biasanya angka terpanjang/terakhir sebelum tanggal
          const cands = [...count(nums).entries()].filter(([, c]) => c >= pres.length * 0.6).map(([t]) => t);
          meta.accountNo = cands.sort((a, b) => b.length - a.length || toks[0].lastIndexOf(b) - toks[0].lastIndexOf(a))[0];
        }
        if (!meta.name) {
          const names = count(toks.map((t) => t.filter((x) => /[A-Za-z]/.test(x)).join(' ')).filter(Boolean));
          const tn2 = top(names);
          if (tn2 && tn2[1] >= pres.length * 0.4) meta.name = tn2[0];
        }
      }
    }
    // bersihkan teks kolom identitas (Cifno/Nama/No Rek) yang terbawa ke keterangan
    {
      const pres = txRows.map((r) => r._pre).filter(Boolean);
      if (pres.length >= 3) {
        const cnt = new Map();
        for (const p of pres) for (const t of p.split(' ')) cnt.set(t, (cnt.get(t) || 0) + 1);
        const idToks = new Set([...cnt.entries()].filter(([t, c]) => c >= pres.length * 0.6 && t.length >= 2).map(([t]) => t));
        if (idToks.size) for (const r of txRows) {
          const ws = r.desc.split(' ');
          // buang deret >= 2 token identitas berurutan (mis. "19005220971 SURYA PERSADA INTIM")
          const out = [];
          for (let i = 0; i < ws.length;) {
            let j = i;
            while (j < ws.length && idToks.has(ws[j])) j++;
            if (j - i >= 2) i = j; else { out.push(ws[i]); i++; }
          }
          r.desc = out.join(' ');
        }
      }
    }
    for (const r of txRows) delete r._pre;
    if (!meta.period) {
      const ds = txRows.filter((r) => r.date).map((r) => r.date);
      const f = (d) => `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`;
      if (ds.length) meta.period = `${f(ds[0])} s/d ${f(ds[ds.length - 1])}`;
    }

    const doc = {
      fileName: opts.fileName || '', docType, bank, meta, rows: txRows, summary,
      accounts: docType === 'gl' ? accounts.filter((a) => txRows.some((r) => r.acct === a) || a.opening != null) : [],
      grand, pageCount: pages.length, ocrPages: pages.filter((p) => p.ocr).length, lineCount: lines.length,
    };
    finalize(doc);
    check(doc);
    return doc;
  }

  function colMap(amts) {
    const m = {};
    for (const a of amts) if (a.col && m[a.col] == null) m[a.col] = a;
    return m;
  }

  function signedSaldo(a) {
    if (!a) return null;
    const v = Math.abs(a.v);
    if (a.flag === 'C') return -v;
    if (a.flag === 'D') return v;
    return a.neg ? -v : v;
  }

  /** Tentukan debit/kredit/saldo dari angka mentah tiap baris. */
  function finalize(doc) {
    const isGL = doc.docType === 'gl';
    let prev = isGL ? null : doc.summary.opening != null ? doc.summary.opening : null;
    let lastAcct = null;
    for (const r of doc.rows) {
      if (isGL && r.acct !== lastAcct) { lastAcct = r.acct; prev = r.acct.opening; }
      const a = r.raw;
      let debit = null, kredit = null, saldo = null, amount = null;
      const withCol = a.filter((x) => x.col);
      if (withCol.length) {
        for (const x of withCol) {
          if (x.col === 'debit' && debit == null) { debit = Math.abs(x.v); if (x.sus) r.sus.debit = true; }
          else if (x.col === 'credit' && kredit == null) { kredit = Math.abs(x.v); if (x.sus) r.sus.kredit = true; }
          else if (x.col === 'saldo' && saldo == null) { saldo = isGL ? signedSaldo(x) : x.flag === 'D' ? -Math.abs(x.v) : x.v; if (x.sus) r.sus.saldo = true; }
          else if (x.col === 'amount' && amount == null) amount = x;
          else if (amount == null && (x.col === 'debit' || x.col === 'credit')) amount = x;
        }
      } else if (a.length) {
        const s = a.slice().sort((p, q) => p.x0 - q.x0);
        if (s.length === 1) amount = s[0];
        else if (s.length === 2) { amount = s[0]; saldo = isGL ? signedSaldo(s[1]) : s[1].v; if (s[1].sus) r.sus.saldo = true; }
        else {
          const last = s[s.length - 1]; saldo = isGL ? signedSaldo(last) : last.v; if (last.sus) r.sus.saldo = true;
          const dd = s[s.length - 3], kk = s[s.length - 2];
          if (dd.v === 0 || kk.v === 0) { debit = Math.abs(dd.v); kredit = Math.abs(kk.v); }
          else amount = kk;
        }
      }
      if (amount) {
        let side = amount.flag || (amount.neg ? 'D' : amount.plus ? 'C' : null);
        if (!side && doc.bank === 'BCA' && !isGL) side = 'C'; // BCA: mutasi tanpa "DB" = kredit
        const v = Math.abs(amount.v);
        if (!side && prev != null && saldo != null) {
          if (isGL) { if (close(prev + v, saldo)) side = 'D'; else if (close(prev - v, saldo)) side = 'C'; }
          else { if (close(prev - v, saldo)) side = 'D'; else if (close(prev + v, saldo)) side = 'C'; }
        }
        if (!side) { side = 'C'; r.sus.side = true; r.notes.push('Arah debit/kredit ditebak — mohon dicek'); }
        if (side === 'D') debit = v; else kredit = v;
        if (amount.sus) r.sus[side === 'D' ? 'debit' : 'kredit'] = true;
      }
      // koreksi otomatis yang aman: angka janggal yang punya alternatif dan alternatif itu membuat saldo cocok
      if (prev != null && saldo != null) {
        const sg = isGL ? 1 : -1; // bank: S = prev - D + K ; GL dicek dua arah di check()
        const fits = (d, k) => close(prev - (d || 0) + (k || 0), saldo) || (isGL && (close(prev + (d || 0) - (k || 0), saldo)));
        if (!fits(debit, kredit)) {
          for (const x of a) {
            if (x.alt == null) continue;
            const v = Math.abs(x.v), alt = Math.abs(x.alt);
            let fixedPair = null;
            if (debit != null && close(debit, v) && fits(alt, kredit)) fixedPair = [alt, kredit, 'debit'];
            else if (kredit != null && close(kredit, v) && fits(debit, alt)) fixedPair = [debit, alt, 'kredit'];
            else if (amount === x && !amount.flag && fits(alt, null)) fixedPair = [alt, null, 'debit'];
            else if (amount === x && !amount.flag && fits(null, alt)) fixedPair = [null, alt, 'kredit'];
            if (fixedPair) {
              [debit, kredit] = fixedPair;
              r.sus[fixedPair[2]] = true; delete r.sus.side;
              r.notes = r.notes.filter((n) => !/ditebak/.test(n));
              r.notes.push(`Angka dikoreksi otomatis: OCR membaca "${x.raw}", disesuaikan dengan saldo menjadi ${fmt(alt)}`);
              break;
            }
          }
        }
      }
      if (debit === 0) debit = null;
      if (kredit === 0) kredit = null;
      r.debit = round2(debit); r.kredit = round2(kredit); r.saldo = round2(saldo);
      if (!r.raw.length) r.notes.push('Tidak ada angka di baris ini');
      if (saldo != null) prev = saldo;
      else if (prev != null && !isGL) prev = prev + (kredit || 0) - (debit || 0);
      delete r.raw;
    }
    // tandai angka tanpa desimal di dokumen yang mayoritas memakai desimal (khusus OCR)
  }

  // ---------------------------------------------------------------- pengecekan

  const fmt = (v) => (v == null ? '-' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  function check(doc) {
    return doc.docType === 'gl' ? checkGL(doc) : checkBank(doc);
  }

  function checkBank(doc) {
    const rows = doc.rows;
    const S = doc.summary;
    const checks = [];
    let opening = S.opening != null ? S.opening : null;
    let openingDerived = false;
    if (opening == null) {
      let acc = 0;
      for (const r of rows) {
        acc += (r.kredit || 0) - (r.debit || 0);
        if (r.saldo != null) { opening = round2(r.saldo - acc); openingDerived = true; break; }
      }
    }
    let running = opening;
    const bad = [];
    let checked = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const exp = running == null ? null : round2(running + (r.kredit || 0) - (r.debit || 0));
      r.calc = exp;
      r.suggest = null;
      if (r.saldo != null && exp != null) {
        r.diff = round2(r.saldo - exp);
        r.status = Math.abs(r.diff) < EPS ? 'ok' : 'err';
        if (r.status === 'err' && oneDigitApart(r.saldo, exp)) r.suggest = { field: 'saldo', value: exp };
        checked++;
        if (r.status === 'err') bad.push(r);
        running = r.saldo;
      } else {
        r.diff = null; r.status = r.saldo == null ? 'na' : 'ok';
        running = exp;
      }
    }
    verifyByArithmetic(rows, S.closing);
    const sumD = round2(rows.reduce((s, r) => s + (r.debit || 0), 0));
    const sumK = round2(rows.reduce((s, r) => s + (r.kredit || 0), 0));
    const nD = rows.filter((r) => r.debit).length;
    const nK = rows.filter((r) => r.kredit).length;
    const closingCalc = opening == null ? null : round2(opening + sumK - sumD);
    const lastSaldoRow = rows.slice().reverse().find((r) => r.saldo != null);
    const lastSaldo = lastSaldoRow ? lastSaldoRow.saldo : null;

    if (!rows.length) {
      checks.push({ level: 'error', title: 'Tidak ada transaksi yang terbaca', detail: 'Coba pilih jenis dokumen/bank secara manual, atau aktifkan "Paksa OCR" bila PDF hasil scan.' });
    } else if (bad.length) {
      const pageBreak = bad.filter((r) => { const idx = rows.indexOf(r); return idx > 0 && rows[idx - 1].page !== r.page; });
      checks.push({ level: 'error', title: `${bad.length} baris saldonya tidak cocok`, detail: `Saldo sebelumnya + kredit − debit ≠ saldo yang tercetak.${pageBreak.length ? ` ${pageBreak.length} di antaranya tepat di pergantian halaman — kemungkinan ada baris yang hilang/terlewat.` : ''} Klik untuk melihat baris.`, rows: bad.map((r) => r.id) });
    } else if (checked) {
      checks.push({ level: 'ok', title: `Saldo setiap baris cocok (${checked} baris dicek)`, detail: 'Saldo sebelumnya + kredit − debit = saldo tercetak, termasuk di pergantian halaman.' });
    } else {
      checks.push({ level: 'warn', title: 'Saldo per baris tidak bisa dicek', detail: 'PDF tidak mencantumkan saldo per transaksi.' });
    }

    const closingOk = S.closing != null && closingCalc != null && close(S.closing, closingCalc);
    const cmp = (title, printed, calc, unit, key) => {
      if (printed == null) return;
      const ok = unit ? printed === calc : close(printed, calc);
      const raw = S._raw && key && S._raw[key];
      if (!ok && !unit && closingOk && !bad.length && digitEditDistance(printed, calc) <= 1) {
        // saldo akhir & semua baris cocok, angka ringkasan hanya beda 1 digit -> hampir pasti salah baca OCR
        checks.push({ level: 'warn', title: `${title}: kemungkinan salah baca OCR`, detail: `Di PDF terbaca ${raw && raw.raw ? `"${raw.raw}"` : fmt(printed)}, hasil hitung ${fmt(calc)}. Hasil hitung konsisten dengan saldo akhir, jadi angka ringkasan di PDF kemungkinan salah baca. Cocokkan dengan dokumen aslinya.` });
        return;
      }
      checks.push({ level: ok ? 'ok' : 'error', title: `${title}: ${ok ? 'cocok' : 'SELISIH'}`, detail: `Menurut PDF ${unit ? printed : fmt(printed)} · hasil hitung ${unit ? calc : fmt(calc)}${ok ? '' : ` · selisih ${unit ? printed - calc : fmt(round2(printed - calc))}`}` });
    };
    cmp('Total mutasi debit', S.debit, sumD, false, 'debit');
    cmp('Total mutasi kredit', S.credit, sumK, false, 'credit');
    cmp('Jumlah transaksi debit', S.debitCount, nD, true);
    cmp('Jumlah transaksi kredit', S.creditCount, nK, true);
    if (S.closing != null) cmp('Saldo akhir (awal + kredit − debit)', S.closing, closingCalc);
    if (lastSaldo != null && closingCalc != null && S.closing == null) {
      const ok = close(lastSaldo, closingCalc);
      checks.push({ level: ok ? 'ok' : 'error', title: `Saldo akhir vs saldo baris terakhir: ${ok ? 'cocok' : 'SELISIH'}`, detail: `Saldo baris terakhir ${fmt(lastSaldo)} · saldo awal + kredit − debit ${fmt(closingCalc)}` });
    } else if (lastSaldo != null && S.closing != null && !close(lastSaldo, S.closing)) {
      checks.push({ level: 'error', title: 'Saldo baris terakhir ≠ saldo akhir di ringkasan', detail: `${fmt(lastSaldo)} vs ${fmt(S.closing)} — kemungkinan ada transaksi terakhir yang tidak terbaca.` });
    }
    if (S.debit == null && S.credit == null && S.closing == null && rows.length) {
      checks.push({ level: 'info', title: 'Ringkasan bank tidak ditemukan di PDF', detail: 'Total debit/kredit tidak bisa dibandingkan dengan angka bank; pengecekan memakai saldo per baris.' });
    }
    if (openingDerived) checks.push({ level: 'info', title: 'Saldo awal dihitung dari baris pertama', detail: `Saldo awal tidak tercetak, dihitung mundur: ${fmt(opening)}.` });
    pushCommon(doc, checks);

    doc.totals = { opening, openingDerived, sumD, sumK, nD, nK, closingCalc, lastSaldo };
    doc.checks = checks;
    doc.status = worst(checks);
    return checks;
  }

  function checkGL(doc) {
    const checks = [];
    const byAcct = new Map();
    for (const a of doc.accounts) byAcct.set(a, []);
    for (const r of doc.rows) { if (!byAcct.has(r.acct)) byAcct.set(r.acct, []); byAcct.get(r.acct).push(r); }
    let totalBad = [];
    let gD = 0, gK = 0;
    const acctResults = [];
    for (const [a, rows] of byAcct) {
      // pilih arah saldo normal: debit (S = prev + D − K) atau kredit (S = prev − D + K)
      const tryDir = (sgn) => {
        let open = a.opening;
        let derived = false;
        if (open == null) {
          let acc = 0;
          for (const r of rows) { acc += sgn * ((r.debit || 0) - (r.kredit || 0)); if (r.saldo != null) { open = round2(r.saldo - acc); derived = true; break; } }
          if (open == null) open = 0;
        }
        let run = open, ok = 0, n = 0;
        for (const r of rows) { const e = round2(run + sgn * ((r.debit || 0) - (r.kredit || 0))); if (r.saldo != null) { n++; if (close(e, r.saldo)) ok++; run = r.saldo; } else run = e; }
        return { sgn, open, derived, ok, n };
      };
      const dDeb = tryDir(1), dKre = tryDir(-1);
      const best = dKre.ok > dDeb.ok ? dKre : dDeb;
      a.normal = best.sgn === 1 ? 'D' : 'K';
      a.openingUsed = best.open; a.openingDerived = best.derived;
      let run = best.open;
      const bad = [];
      for (const r of rows) {
        const e = round2(run + best.sgn * ((r.debit || 0) - (r.kredit || 0)));
        r.calc = e;
        if (r.saldo != null) { r.diff = round2(r.saldo - e); r.status = Math.abs(r.diff) < EPS ? 'ok' : 'err'; if (r.status === 'err') bad.push(r); run = r.saldo; }
        else { r.diff = null; r.status = 'na'; run = e; }
      }
      const sumD = round2(rows.reduce((s, r) => s + (r.debit || 0), 0));
      const sumK = round2(rows.reduce((s, r) => s + (r.kredit || 0), 0));
      gD += sumD; gK += sumK;
      const closingCalc = round2(best.open + best.sgn * (sumD - sumK));
      const P = a.printed || {};
      const res = { acct: a, rows: rows.length, sumD, sumK, closingCalc, bad: bad.length, issues: [] };
      if (P.debit != null && !close(P.debit, sumD)) res.issues.push(`total debit PDF ${fmt(P.debit)} ≠ hitung ${fmt(sumD)}`);
      if (P.credit != null && !close(P.credit, sumK)) res.issues.push(`total kredit PDF ${fmt(P.credit)} ≠ hitung ${fmt(sumK)}`);
      if (P.closing != null && !close(Math.abs(P.closing), Math.abs(closingCalc))) res.issues.push(`saldo akhir PDF ${fmt(P.closing)} ≠ hitung ${fmt(closingCalc)}`);
      a.result = res;
      acctResults.push(res);
      totalBad = totalBad.concat(bad);
    }
    gD = round2(gD); gK = round2(gK);
    const label = (a) => `${a.code ? a.code + ' ' : ''}${a.name || ''}`.trim() || '(tanpa akun)';
    if (!doc.rows.length) checks.push({ level: 'error', title: 'Tidak ada transaksi yang terbaca', detail: 'Coba pilih jenis dokumen secara manual, atau aktifkan "Paksa OCR" bila PDF hasil scan.' });
    else if (totalBad.length) checks.push({ level: 'error', title: `${totalBad.length} baris saldonya tidak cocok`, detail: 'Saldo sebelumnya ± debit/kredit ≠ saldo tercetak. Klik untuk melihat baris.', rows: totalBad.map((r) => r.id) });
    else if (doc.rows.some((r) => r.saldo != null)) checks.push({ level: 'ok', title: `Saldo setiap baris cocok di ${acctResults.length} akun`, detail: `${doc.rows.length} transaksi dicek dengan arah saldo normal masing-masing akun.` });

    const withIssues = acctResults.filter((r) => r.issues.length);
    const withPrinted = acctResults.filter((r) => Object.keys(r.acct.printed || {}).length);
    if (withIssues.length) {
      checks.push({ level: 'error', title: `${withIssues.length} akun totalnya tidak cocok dengan PDF`, detail: withIssues.slice(0, 6).map((r) => `${label(r.acct)}: ${r.issues.join('; ')}`).join(' · '), rows: doc.rows.filter((x) => withIssues.some((w) => w.acct === x.acct)).map((x) => x.id).slice(0, 1) });
    } else if (withPrinted.length) {
      checks.push({ level: 'ok', title: `Total debit, kredit & saldo akhir cocok di ${withPrinted.length} akun`, detail: 'Dibandingkan dengan baris Total/Saldo Akhir yang tercetak per akun.' });
    } else if (doc.rows.length) {
      checks.push({ level: 'info', title: 'Baris total per akun tidak ditemukan', detail: 'Total per akun hanya dihitung, tidak bisa dibandingkan dengan PDF.' });
    }
    const G = doc.grand || {};
    if (G.debit != null) {
      const ok = close(G.debit, gD) && (G.credit == null || close(G.credit, gK));
      checks.push({ level: ok ? 'ok' : 'error', title: `Grand total: ${ok ? 'cocok' : 'SELISIH'}`, detail: `PDF debit ${fmt(G.debit)} / kredit ${fmt(G.credit)} · hitung ${fmt(gD)} / ${fmt(gK)}` });
    }
    if (doc.rows.length) {
      const bal = close(gD, gK);
      checks.push({ level: bal ? 'ok' : 'info', title: bal ? 'Total debit = total kredit (seimbang)' : 'Total debit ≠ total kredit', detail: bal ? `Keduanya ${fmt(gD)}.` : `Debit ${fmt(gD)} vs kredit ${fmt(gK)}. Wajar bila PDF hanya berisi sebagian akun; harus seimbang bila berisi seluruh akun.` });
    }
    pushCommon(doc, checks);
    doc.totals = { sumD: gD, sumK: gK, accounts: acctResults };
    doc.checks = checks;
    doc.status = worst(checks);
    return checks;
  }

  /**
   * Angka yang ditandai "kurang yakin" tapi terbukti benar lewat hitungan saldo tidak perlu dicek lagi:
   * - debit/kredit terbukti bila baris itu cocok (saldo sebelumnya ± mutasi = saldo tercetak);
   * - saldo terbukti bila baris berikutnya yang bersaldo juga cocok (atau = saldo akhir tercetak).
   * Angka yang dikoreksi otomatis tetap ditandai agar transparan.
   */
  function verifyByArithmetic(rows, closingPrinted) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.sus || r.status !== 'ok' || r.saldo == null) continue;
      if (r.notes.some((n) => /dikoreksi/.test(n))) continue;
      delete r.sus.debit; delete r.sus.kredit; delete r.sus.side;
      r.notes = r.notes.filter((n) => !/ditebak/.test(n));
      const next = rows.slice(i + 1).find((x) => x.saldo != null);
      if ((next && next.status === 'ok') || (!next && closingPrinted != null && close(closingPrinted, r.saldo))) delete r.sus.saldo;
    }
  }

  /** Jarak edit (sisip/hapus/ganti) antar deret digit dua angka. */
  function digitEditDistance(a, b) {
    const x = Math.abs(a).toFixed(2).replace('.', ''), y = Math.abs(b).toFixed(2).replace('.', '');
    const dp = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
    for (let j = 1; j <= y.length; j++) dp[0][j] = j;
    for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    return dp[x.length][y.length];
  }

  /** true bila dua angka hanya berbeda satu digit (pola khas salah baca OCR). */
  function oneDigitApart(a, b) {
    const x = Math.abs(a).toFixed(2), y = Math.abs(b).toFixed(2);
    if (x.length !== y.length || Math.sign(a) !== Math.sign(b)) return false;
    let n = 0;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++;
    return n === 1;
  }

  function pushCommon(doc, checks) {
    const susRows = doc.rows.filter((r) => Object.keys(r.sus).some((k) => k !== 'side'));
    const sideRows = doc.rows.filter((r) => r.sus.side);
    if (susRows.length) checks.push({ level: 'warn', title: `${susRows.length} angka perlu dicek manual`, detail: 'Hasil baca (OCR) kurang yakin atau format angkanya janggal. Sel ditandai kuning.', rows: susRows.map((r) => r.id) });
    if (sideRows.length) checks.push({ level: 'warn', title: `${sideRows.length} baris arah debit/kredit-nya ditebak`, detail: 'Tidak ada tanda DB/CR dan tidak bisa dipastikan dari saldo.', rows: sideRows.map((r) => r.id) });
    if (doc.ocrPages) checks.push({ level: 'info', title: `${doc.ocrPages} dari ${doc.pageCount} halaman dibaca dengan OCR`, detail: 'Halaman tidak punya teks digital (hasil scan). Mohon periksa sel berwarna kuning.' });
  }

  function worst(checks) {
    if (checks.some((c) => c.level === 'error')) return 'error';
    if (checks.some((c) => c.level === 'warn')) return 'warn';
    return 'ok';
  }

  /** Cek kesinambungan antar file (saldo akhir bulan lalu = saldo awal bulan ini). */
  function checkContinuity(docs) {
    const banks = docs.filter((d) => d.docType === 'bank' && d.rows.length && d.totals);
    const key = (d) => (d.meta.accountNo || '').replace(/\D/g, '') || '_';
    const groups = new Map();
    for (const d of banks) { if (!groups.has(key(d))) groups.set(key(d), []); groups.get(key(d)).push(d); }
    const out = [];
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      const firstDate = (d) => { const r = d.rows.find((x) => x.date); return r ? r.date.y * 10000 + r.date.m * 100 + r.date.d : 0; };
      list.sort((a, b) => firstDate(a) - firstDate(b));
      for (let i = 0; i + 1 < list.length; i++) {
        const A = list[i], B = list[i + 1];
        const lastDate = (d) => { const r = d.rows.slice().reverse().find((x) => x.date); return r ? r.date.y * 10000 + r.date.m * 100 + r.date.d : 0; };
        if (firstDate(B) < lastDate(A)) {
          out.push({ from: A.fileName, to: B.fileName, level: 'warn', ok: true, endA: null, startB: null, overlap: true, title: `${A.fileName} & ${B.fileName}: periodenya tumpang tindih`, detail: 'Kedua file mencakup tanggal yang sama. Mungkin file yang sama (atau periode yang sama) diunggah dua kali; hapus salah satunya agar transaksi tidak dobel di Excel.' });
          continue;
        }
        const endA = A.summary.closing != null ? A.summary.closing : A.totals.lastSaldo != null ? A.totals.lastSaldo : A.totals.closingCalc;
        const startB = B.summary.opening != null ? B.summary.opening : B.totals.opening;
        const ok = close(endA, startB);
        out.push({ from: A.fileName, to: B.fileName, endA, startB, ok, level: ok ? 'ok' : 'error', title: `${A.fileName} → ${B.fileName}: ${ok ? 'saldo bersambung' : 'saldo TIDAK bersambung'}`, detail: `Saldo akhir ${fmt(endA)} · saldo awal berikutnya ${fmt(startB)}${ok ? '' : ' — kemungkinan ada periode/mutasi yang hilang.'}` });
      }
    }
    return out;
  }

  /** Teks tanggal -> {d,m,y} (untuk edit manual). */
  function parseDateText(s, fallbackYear) {
    const words = clean(s).split(' ').map((t) => ({ t }));
    const d = matchDate(words, 0);
    if (!d) return null;
    return { d: d.d, m: d.m, y: d.y || fallbackYear || new Date().getFullYear() };
  }

  return {
    wordsFromTextItems, wordsFromOcr, linesFromWords, parse, check, checkContinuity,
    parseAmount, matchDate, parseDateText, finalize, detectBank, BANKS: BANKS.map((b) => b[0]), fmt, _internal: { classify, detectHeader, findLabels },
  };
});
