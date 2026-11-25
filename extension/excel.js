/*
 * ConPEx — pembuat file Excel (ExcelJS).
 * Kolom cek di Excel berupa RUMUS asli, jadi bila angka diedit di Excel pengecekannya ikut berubah.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('exceljs'));
  else root.ConPExExcel = factory(root.ExcelJS);
})(typeof self !== 'undefined' ? self : this, function (ExcelJS) {
  'use strict';

  const NUM = '#,##0.00;[Red]-#,##0.00';
  const INT = '#,##0';
  const DATE = 'dd/mm/yyyy';
  const C = {
    ink: 'FF14323A', head: 'FF1F5F5B', headText: 'FFFFFFFF', band: 'FFF2F6F5', line: 'FFD5DFDC',
    open: 'FFE9EFEE', bad: 'FFF9D6D5', badText: 'FF9B1C1C', good: 'FFDDF0E3', goodText: 'FF1E6B3A', sus: 'FFFFF1B8',
  };
  const thin = { style: 'thin', color: { argb: C.line } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  const toDate = (d) => (d ? new Date(Date.UTC(d.y, d.m - 1, d.d)) : null);
  const f = (formula, result) => ({ formula, result: result == null ? undefined : result });

  function styleHeader(row) {
    row.height = 30;
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: C.headText } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = border;
    });
  }

  function titleBlock(ws, lines) {
    lines.forEach((t, i) => {
      const c = ws.getCell(i + 1, 1);
      c.value = t;
      c.font = i === 0 ? { bold: true, size: 14, color: { argb: C.ink } } : { size: 10, color: { argb: 'FF4A5D60' } };
    });
  }

  function statusRules(ws, ref, col, firstRow) {
    ws.addConditionalFormatting({
      ref,
      rules: [
        { type: 'expression', priority: 1, formulae: [`$${col}${firstRow}="SELISIH"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.bad } }, font: { color: { argb: C.badText } } } },
      ],
    });
  }

  function statusCellRules(ws, ref, firstCell) {
    ws.addConditionalFormatting({
      ref,
      rules: [
        { type: 'containsText', operator: 'containsText', text: 'SELISIH', priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.bad } }, font: { bold: true, color: { argb: C.badText } } } },
        { type: 'containsText', operator: 'containsText', text: 'COCOK', priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.good } }, font: { bold: true, color: { argb: C.goodText } } } },
        { type: 'containsText', operator: 'containsText', text: 'SEIMBANG', priority: 3, style: { font: { bold: true, color: { argb: C.goodText } } } },
      ],
    });
  }

  function markSus(cell, note) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sus } };
    cell.note = note || 'Perlu dicek: hasil baca (OCR) kurang yakin atau angka dikoreksi otomatis.';
  }

  // ------------------------------------------------------------ rekening koran

  function bankSheets(wb, docs, continuity, opts = {}) {
    const ws = wb.addWorksheet('Transaksi', { views: [{ state: 'frozen', ySplit: 6 }] });
    const multi = docs.length > 1;
    const d0 = docs[0];
    titleBlock(ws, [
      `Rekening Koran${d0.bank ? ' — ' + d0.bank : ''}`,
      [d0.meta.accountNo && `No. Rekening: ${d0.meta.accountNo}`, d0.meta.name && `Nama: ${d0.meta.name}`].filter(Boolean).join('    ') || ' ',
      multi ? `Periode: ${docs.map((d) => d.meta.period).filter(Boolean).join(', ')}` : `Periode: ${d0.meta.period || '-'}`,
      'Dibuat dengan ConPEx. Kolom Saldo Hitung, Selisih & Status berupa rumus — lihat juga sheet Rekonsiliasi.',
    ]);
    const cols = [
      ['No', 6], ['Tanggal', 12], ['Keterangan', 48], ['Ref / Cabang', 14], ['Debit', 17], ['Kredit', 17],
      ['Saldo (PDF)', 18], ['Saldo Hitung', 18], ['Selisih', 13], ['Status', 11], ['Hal.', 6],
    ];
    if (multi) cols.push(['File', 26]);
    // kolom analisis uang masuk (bila sudah dianalisis)
    const withInc = opts.income !== false && docs.some((d) => d.rows.some((x) => x.inc));
    const INC = {};
    if (withInc) {
      for (const [key, name, w] of [['kat', 'Kategori uang masuk', 27], ['jenis', 'Jenis', 30], ['conf', 'Keyakinan', 11], ['alasan', 'Alasan', 46], ['pihak', 'Pihak (perkiraan)', 24], ['bulan', 'Bulan', 9]]) {
        cols.push([name, w]); INC[key] = colLetter(cols.length);
      }
    }
    cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
    const hr = ws.getRow(6);
    hr.values = cols.map((c) => c[0]);
    styleHeader(hr);

    let r = 7;
    const blocks = [];
    for (const doc of docs) {
      const T = doc.totals || {};
      const openRow = r;
      const firstDate = doc.rows.find((x) => x.date);
      const row = ws.getRow(r);
      row.values = ['', firstDate ? toDate(firstDate.date) : null, `SALDO AWAL${T.openingDerived ? ' (dihitung mundur)' : ''}${multi ? ' — ' + doc.fileName : ''}`, '', null, null, T.opening == null ? 0 : T.opening, f(`G${r}`, T.opening || 0), null, 'Saldo awal', '', ...(multi ? [doc.fileName] : [])];
      row.eachCell({ includeEmpty: true }, (c, i) => { if (i <= cols.length) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.open } }; c.font = { italic: true, color: { argb: 'FF4A5D60' } }; c.border = border; } });
      r++;
      const first = r;
      let n = 0;
      for (const x of doc.rows) {
        n++;
        const R = ws.getRow(r);
        R.values = [
          n, toDate(x.date), x.desc, x.ref || '', x.debit, x.kredit, x.saldo,
          f(`IF(G${r - 1}<>"",G${r - 1},H${r - 1})+N(F${r})-N(E${r})`, x.calc),
          f(`IF(G${r}="","",G${r}-H${r})`, x.diff == null ? '' : x.diff),
          f(`IF(G${r}="","-",IF(ABS(G${r}-H${r})<0.005,"OK","SELISIH"))`, x.saldo == null ? '-' : x.status === 'err' ? 'SELISIH' : 'OK'),
          x.page, ...(multi ? [doc.fileName] : []),
          ...(withInc ? (x.inc ? [x.inc.label, x.inc.jenis, x.inc.conf, x.inc.reason + (x.inc.manual ? ' (dipilih manual)' : ''), x.inc.party || '', monthKey(x.date)] : ['', '', '', '', '', '']) : []),
        ];
        if (withInc && x.inc) R.getCell(INC.kat).dataValidation = { type: 'list', allowBlank: true, showErrorMessage: true, errorTitle: 'Kategori', error: 'Pilih salah satu kategori dari daftar.', formulae: [CAT_LIST] };
        if (n % 2 === 0) R.eachCell({ includeEmpty: true }, (c, i) => { if (i <= cols.length) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.band } }; });
        R.eachCell({ includeEmpty: true }, (c, i) => { if (i <= cols.length) c.border = border; });
        const note = x.notes && x.notes.length ? x.notes.join(' · ') : undefined;
        if (x.sus.debit) markSus(R.getCell(5), note);
        if (x.sus.kredit) markSus(R.getCell(6), note);
        if (x.sus.saldo) markSus(R.getCell(7), note);
        if (x.sus.side) markSus(R.getCell(x.debit ? 5 : 6), 'Arah debit/kredit ditebak — mohon dicek.');
        if (note && !Object.keys(x.sus).length) R.getCell(3).note = note;
        r++;
      }
      blocks.push({ doc, openRow, first, last: r - 1 });
    }
    const lastData = r - 1;
    ws.getRow(r).values = ['', '', 'TOTAL', '', f(`SUM(E7:E${lastData})`, round(docs.reduce((s, d) => s + (d.totals.sumD || 0), 0))), f(`SUM(F7:F${lastData})`, round(docs.reduce((s, d) => s + (d.totals.sumK || 0), 0)))];
    ws.getRow(r).eachCell({ includeEmpty: true }, (c, i) => { if (i <= cols.length) { c.font = { bold: true }; c.border = { top: { style: 'medium', color: { argb: C.ink } } }; } });
    for (const col of ['E', 'F', 'G', 'H', 'I']) ws.getColumn(col).numFmt = NUM;
    ws.getColumn('B').numFmt = DATE;
    ws.getColumn('C').alignment = { wrapText: true, vertical: 'top' };
    ws.getColumn('J').alignment = { horizontal: 'center' };
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastData, column: cols.length } };
    statusRules(ws, `A7:${String.fromCharCode(64 + cols.length)}${lastData}`, 'J', 7);
    if (withInc) catColors(ws, `${INC.kat}7:${INC.kat}${lastData}`, INC.kat, 7);

    // --- Rekonsiliasi
    const rs = wb.addWorksheet('Rekonsiliasi');
    [44, 20, 20, 16, 20].forEach((w, i) => (rs.getColumn(i + 1).width = w));
    titleBlock(rs, ['Rekonsiliasi & Pengecekan Angka', 'Kolom "Hasil Hitung" dihitung ulang dari sheet Transaksi dengan rumus; "Menurut PDF" adalah angka yang tercetak di dokumen.']);
    let y = 4;
    const statusF = (row) => f(`IF(B${row}="","Tidak tercetak di PDF",IF(ABS(B${row}-C${row})<0.005,"COCOK","SELISIH"))`);
    const diffF = (row) => f(`IF(B${row}="","",B${row}-C${row})`);
    for (const b of blocks) {
      const d = b.doc, S = d.summary, T = d.totals;
      const title = rs.getRow(y);
      title.getCell(1).value = `${d.fileName || 'Dokumen'}${d.bank ? ' — ' + d.bank : ''}${d.meta.accountNo ? ' — ' + d.meta.accountNo : ''}${d.meta.period ? ' — ' + d.meta.period : ''}`;
      title.getCell(1).font = { bold: true, size: 12, color: { argb: C.ink } };
      y++;
      rs.getRow(y).values = ['Pemeriksaan', 'Menurut PDF', 'Hasil Hitung', 'Selisih', 'Status'];
      styleHeader(rs.getRow(y));
      y++;
      const E = `Transaksi!E${b.first}:E${b.last}`, F = `Transaksi!F${b.first}:F${b.last}`, G = `Transaksi!G${b.first}:G${b.last}`, J = `Transaksi!J${b.first}:J${b.last}`;
      const has = b.last >= b.first;
      const start = y;
      const lines = [
        ['Saldo awal', S.opening, f(`Transaksi!G${b.openRow}`, T.opening), false],
        ['Total mutasi debit', S.debit, f(has ? `SUM(${E})` : '0', T.sumD), false],
        ['Total mutasi kredit', S.credit, f(has ? `SUM(${F})` : '0', T.sumK), false],
        ['Jumlah transaksi debit', S.debitCount, f(has ? `COUNTIF(${E},">0")` : '0', T.nD), true],
        ['Jumlah transaksi kredit', S.creditCount, f(has ? `COUNTIF(${F},">0")` : '0', T.nK), true],
      ];
      for (const [label, printed, calc, isInt] of lines) {
        rs.getRow(y).values = [label, printed == null ? null : printed, calc, diffF(y), statusF(y)];
        if (isInt) ['B', 'C', 'D'].forEach((c) => (rs.getCell(`${c}${y}`).numFmt = INT));
        y++;
      }
      const yOpen = start, yD = start + 1, yK = start + 2;
      rs.getRow(y).values = ['Saldo akhir (saldo awal + kredit − debit)', S.closing == null ? null : S.closing, f(`C${yOpen}+C${yK}-C${yD}`, T.closingCalc), diffF(y), statusF(y)];
      const yClose = y; y++;
      const lastSaldoRow = (() => { for (let i = d.rows.length - 1; i >= 0; i--) if (d.rows[i].saldo != null) return b.first + i; return null; })();
      if (lastSaldoRow) { rs.getRow(y).values = ['Saldo di baris terakhir tabel vs saldo akhir hitung', f(`Transaksi!G${lastSaldoRow}`, T.lastSaldo), f(`C${yClose}`, T.closingCalc), diffF(y), statusF(y)]; y++; }
      const badCount = d.rows.filter((x) => x.status === 'err').length;
      rs.getRow(y).values = ['Baris dengan saldo tidak cocok', 0, f(has ? `COUNTIF(${J},"SELISIH")` : '0', badCount), diffF(y), f(`IF(C${y}=0,"COCOK","SELISIH (" & C${y} & " baris)")`)];
      ['B', 'C', 'D'].forEach((c) => (rs.getCell(`${c}${y}`).numFmt = INT));
      y++;
      for (let i = start; i < y; i++) { ['B', 'C', 'D'].forEach((c) => { if (!rs.getCell(`${c}${i}`).numFmt) rs.getCell(`${c}${i}`).numFmt = NUM; }); rs.getRow(i).eachCell({ includeEmpty: true }, (c, k) => { if (k <= 5) c.border = border; }); }
      statusCellRules(rs, `E${start}:E${y - 1}`);
      // catatan hasil cek dari mesin
      y++;
      rs.getCell(`A${y}`).value = 'Catatan pemeriksaan otomatis:'; rs.getCell(`A${y}`).font = { bold: true }; y++;
      for (const c of d.checks) { rs.getCell(`A${y}`).value = `${c.level === 'ok' ? '✔' : c.level === 'error' ? '✖' : c.level === 'warn' ? '!' : 'i'}  ${c.title} — ${c.detail}`; rs.getCell(`A${y}`).alignment = { wrapText: false }; y++; }
      y += 2;
    }
    if (continuity && continuity.length) {
      rs.getCell(`A${y}`).value = 'Kesinambungan antar file (saldo akhir → saldo awal berikutnya)'; rs.getCell(`A${y}`).font = { bold: true, size: 12, color: { argb: C.ink } }; y++;
      rs.getRow(y).values = ['Dari → Ke', 'Saldo akhir', 'Saldo awal berikutnya', 'Selisih', 'Status']; styleHeader(rs.getRow(y)); y++;
      const s0 = y;
      for (const c of continuity.filter((x) => !x.overlap)) {
        rs.getRow(y).values = [`${c.from} → ${c.to}`, c.endA, c.startB, f(`B${y}-C${y}`, round(c.endA - c.startB)), f(`IF(ABS(B${y}-C${y})<0.005,"COCOK","SELISIH")`, c.ok ? 'COCOK' : 'SELISIH')];
        ['B', 'C', 'D'].forEach((k) => (rs.getCell(`${k}${y}`).numFmt = NUM));
        y++;
      }
      statusCellRules(rs, `E${s0}:E${y - 1}`);
    }
    if (withInc) {
      const map = new Map();
      for (const b of blocks) b.doc.rows.forEach((x, i) => map.set(b.first + i, x));
      rowAt = (row) => map.get(row);
      incomeSheets(wb, docs, INC, 7, lastData);
    }
  }

  // ------------------------------------------------------------ analisis uang masuk
  const CATS = ['Indikasi penghasilan usaha', 'Penghasilan bunga / bagi hasil', 'Bukan penghasilan', 'Perlu dicek'];
  const CAT_LIST = '"' + CATS.join(',') + '"';
  const CAT_COLOR = { 'Indikasi penghasilan usaha': 'FFDDF0E3', 'Penghasilan bunga / bagi hasil': 'FFE3EDF8', 'Bukan penghasilan': 'FFECEFEF', 'Perlu dicek': 'FFFFF1B8' };
  const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const monthKey = (d) => (d ? `${d.y}-${String(d.m).padStart(2, '0')}` : '');
  const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthLabel = (k) => { const [y, m] = k.split('-'); return m ? `${MONTHS_ID[+m - 1]} ${y}` : k; };

  function catColors(ws, ref, col, firstRow) {
    ws.addConditionalFormatting({
      ref,
      rules: CATS.map((c, i) => ({ type: 'expression', priority: 10 + i, formulae: [`$${col}${firstRow}="${c}"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: CAT_COLOR[c] } } } })),
    });
  }

  function incomeSheets(wb, docs, INC, firstData, lastData) {
    const K = `Transaksi!$F$${firstData}:$F$${lastData}`;
    const KAT = `Transaksi!$${INC.kat}$${firstData}:$${INC.kat}$${lastData}`;
    const BLN = `Transaksi!$${INC.bulan}$${firstData}:$${INC.bulan}$${lastData}`;
    const PIH = `Transaksi!$${INC.pihak}$${firstData}:$${INC.pihak}$${lastData}`;
    const CONF = `Transaksi!$${INC.conf}$${firstData}:$${INC.conf}$${lastData}`;
    const credits = [];
    for (const d of docs) for (const x of d.rows) if (x.kredit && x.inc) credits.push(x);
    const sumBy = (fn) => Math.round(credits.filter(fn).reduce((s, x) => s + x.kredit, 0) * 100) / 100;
    const disclaimer = 'Kategori adalah INDIKASI otomatis dari keterangan bank, bukan kesimpulan pajak. Ganti kategori di sheet Transaksi (kolom "Kategori uang masuk", ada pilihan dropdown); semua rekap di sini ikut berubah.';

    // --- 1. Rekap bulanan (ekualisasi)
    const ws = wb.addWorksheet('Uang Masuk - Bulanan', { views: [{ state: 'frozen', ySplit: 5 }] });
    titleBlock(ws, ['Rekap Uang Masuk per Bulan (untuk ekualisasi)', disclaimer, 'Isi kolom "Peredaran bruto SPT/PPN" dengan angka dari SPT/SPT Masa PPN untuk melihat selisihnya.']);
    ws.getCell('A2').alignment = { wrapText: true }; ws.getRow(2).height = 30;
    const hdr = ['Bulan', 'Kunci bulan', 'Total uang masuk', 'Indikasi penghasilan usaha', 'Penghasilan bunga / bagi hasil', 'Bukan penghasilan', 'Perlu dicek', 'Peredaran bruto SPT/PPN (isi sendiri)', 'Selisih: usaha − SPT', 'Selisih bila "perlu dicek" = penghasilan'];
    [12, 10, 19, 21, 19, 19, 17, 22, 19, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getRow(5).values = hdr; styleHeader(ws.getRow(5)); ws.getRow(5).height = 44;
    const months = [...new Set(credits.map((x) => monthKey(x.date)).filter(Boolean))].sort();
    let y = 6;
    for (const m of months) {
      const inM = (x) => monthKey(x.date) === m;
      ws.getRow(y).values = [
        monthLabel(m), m,
        f(`SUMIFS(${K},${BLN},$B${y})`, sumBy(inM)),
        ...CATS.map((c, i) => f(`SUMIFS(${K},${BLN},$B${y},${KAT},"${c}")`, sumBy((x) => inM(x) && x.inc.label === c))),
        null,
        f(`IF(H${y}="","",D${y}-H${y})`, ''),
        f(`IF(H${y}="","",D${y}+G${y}-H${y})`, ''),
      ];
      ws.getCell(`H${y}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sus } };
      ws.getRow(y).eachCell({ includeEmpty: true }, (c, k) => { if (k <= hdr.length) c.border = border; });
      y++;
    }
    const last = y - 1;
    ws.getRow(y).values = ['TOTAL', '', ...['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((c) => f(`SUM(${c}6:${c}${last})`))];
    ws.getRow(y).eachCell({ includeEmpty: true }, (c) => { c.font = { bold: true }; c.border = { top: { style: 'medium', color: { argb: C.ink } } }; });
    ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach((c) => (ws.getColumn(c).numFmt = NUM));
    ws.getColumn('B').hidden = true;
    for (const c of ['D']) ws.getColumn(c).font = { bold: true };

    // --- 2. Rincian (persiapan pemeriksaan)
    const wr = wb.addWorksheet('Uang Masuk - Rincian', { views: [{ state: 'frozen', ySplit: 4 }] });
    titleBlock(wr, ['Rincian Uang Masuk (untuk pemeriksaan)', 'Kolom Penjelasan & Dokumen pendukung diisi sendiri. Kategori mengikuti sheet Transaksi.']);
    const rh = ['Tanggal', 'Keterangan', 'Nominal', 'Kategori', 'Jenis', 'Keyakinan', 'Alasan', 'Pihak (perkiraan)', 'Penjelasan WP', 'Dokumen pendukung'];
    [12, 46, 18, 26, 28, 11, 40, 22, 32, 24].forEach((w, i) => (wr.getColumn(i + 1).width = w));
    wr.getRow(4).values = rh; styleHeader(wr.getRow(4));
    let z = 5;
    for (let row = firstData; row <= lastData; row++) {
      const x = rowAt(row);
      if (!x || !x.kredit || !x.inc) continue;
      wr.getRow(z).values = [
        f(`Transaksi!B${row}`, toDate(x.date)), f(`Transaksi!C${row}`, x.desc), f(`Transaksi!F${row}`, x.kredit),
        f(`Transaksi!${INC.kat}${row}`, x.inc.label), f(`Transaksi!${INC.jenis}${row}`, x.inc.jenis), f(`Transaksi!${INC.conf}${row}`, x.inc.conf),
        f(`Transaksi!${INC.alasan}${row}`, x.inc.reason), f(`Transaksi!${INC.pihak}${row}`, x.inc.party || ''), '', '',
      ];
      for (const c of ['I', 'J']) wr.getCell(`${c}${z}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEA' } };
      wr.getRow(z).eachCell({ includeEmpty: true }, (c, k) => { if (k <= rh.length) c.border = border; });
      z++;
    }
    wr.getColumn('A').numFmt = DATE; wr.getColumn('C').numFmt = NUM;
    wr.getColumn('B').alignment = { wrapText: true, vertical: 'top' }; wr.getColumn('G').alignment = { wrapText: true, vertical: 'top' };
    if (z > 5) { wr.autoFilter = { from: { row: 4, column: 1 }, to: { row: z - 1, column: rh.length } }; catColors(wr, `D5:D${z - 1}`, 'D', 5); }
    const totalRow = z;
    wr.getRow(z).values = ['', 'TOTAL', f(`SUM(C5:C${z - 1})`)]; wr.getRow(z).font = { bold: true };

    // --- 3. Ringkasan (analisis umum)
    const wsum = wb.addWorksheet('Uang Masuk - Ringkasan');
    titleBlock(wsum, ['Ringkasan Uang Masuk', disclaimer]);
    wsum.getCell('A2').alignment = { wrapText: true }; wsum.getRow(2).height = 30;
    [34, 16, 20, 12, 26].forEach((w, i) => (wsum.getColumn(i + 1).width = w));
    wsum.getRow(4).values = ['Kategori', 'Jumlah transaksi', 'Total', '% dari uang masuk'];
    styleHeader(wsum.getRow(4));
    let q = 5;
    const totalAll = sumBy(() => true);
    for (const c of CATS) {
      wsum.getRow(q).values = [c, f(`COUNTIFS(${KAT},"${c}")`, credits.filter((x) => x.inc.label === c).length), f(`SUMIFS(${K},${KAT},"${c}")`, sumBy((x) => x.inc.label === c)), f(`IF($C$9=0,0,C${q}/$C$9)`)];
      wsum.getCell(`A${q}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CAT_COLOR[c] } };
      q++;
    }
    wsum.getRow(q).values = ['Total uang masuk', f(`SUM(B5:B8)`, credits.length), f(`SUM(C5:C8)`, totalAll), f(`IF(C${q}=0,0,1)`)];
    wsum.getRow(q).font = { bold: true };
    for (let i = 5; i <= q; i++) wsum.getRow(i).eachCell({ includeEmpty: true }, (c, k) => { if (k <= 4) c.border = border; });
    wsum.getColumn('C').numFmt = NUM; wsum.getColumn('D').numFmt = '0.0%';
    wsum.addConditionalFormatting({ ref: 'C5:C8', rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FF5FB3A9' } }] });
    q += 2;
    wsum.getCell(`A${q}`).value = 'Yang perlu diperhatikan'; wsum.getCell(`A${q}`).font = { bold: true, size: 12, color: { argb: C.ink } }; q++;
    wsum.getRow(q).values = ['Transaksi "Perlu dicek"', f(`COUNTIFS(${KAT},"Perlu dicek")`), f(`SUMIFS(${K},${KAT},"Perlu dicek")`)]; q++;
    wsum.getRow(q).values = ['Keyakinan rendah (semua kategori)', f(`COUNTIFS(${CONF},"rendah")`), f(`SUMIFS(${K},${CONF},"rendah")`)]; q++;
    q += 1;
    wsum.getCell(`A${q}`).value = 'Pihak pengirim terbesar (perkiraan dari keterangan)'; wsum.getCell(`A${q}`).font = { bold: true, size: 12, color: { argb: C.ink } }; q++;
    wsum.getRow(q).values = ['Pihak (perkiraan)', 'Jumlah transaksi', 'Total', '% dari uang masuk', 'Kategori terbanyak']; styleHeader(wsum.getRow(q)); q++;
    const parties = new Map();
    for (const x of credits) { const k = x.inc.party || ''; if (!k) continue; if (!parties.has(k)) parties.set(k, { t: 0, n: 0, cats: {} }); const p = parties.get(k); p.t += x.kredit; p.n++; p.cats[x.inc.label] = (p.cats[x.inc.label] || 0) + x.kredit; }
    const top = [...parties.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 10);
    const p0 = q;
    for (const [name, p] of top) {
      wsum.getRow(q).values = [name, f(`COUNTIFS(${PIH},A${q})`, p.n), f(`SUMIFS(${K},${PIH},A${q})`, Math.round(p.t * 100) / 100), f(`IF($C$9=0,0,C${q}/$C$9)`), Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0][0]];
      wsum.getRow(q).eachCell({ includeEmpty: true }, (c, k) => { if (k <= 5) c.border = border; });
      q++;
    }
    if (q > p0) catColors(wsum, `E${p0}:E${q - 1}`, 'E', p0);
    q++;
    wsum.getCell(`A${q}`).value = 'Catatan: pihak pengirim ditebak dari kata-kata di akhir keterangan bank, bisa tidak tepat.';
    wsum.getCell(`A${q}`).font = { italic: true, size: 9, color: { argb: 'FF4A5D60' } };
  }
  let rowAt = () => null;

  // ------------------------------------------------------------ buku besar

  function glSheets(wb, docs) {
    const ws = wb.addWorksheet('Buku Besar', { views: [{ state: 'frozen', ySplit: 6 }] });
    const multi = docs.length > 1;
    titleBlock(ws, ['Buku Besar', `Periode: ${docs.map((d) => d.meta.period).filter(Boolean).join(', ') || '-'}`, ' ', 'Dibuat dengan ConPEx. Saldo Hitung memakai arah saldo normal tiap akun (lihat sheet Ringkasan Akun).']);
    const cols = [['No. Akun', 11], ['Nama Akun', 24], ['Tanggal', 12], ['No. Bukti', 14], ['Keterangan', 40], ['Debit', 17], ['Kredit', 17], ['Saldo (PDF)', 18], ['Saldo Hitung', 18], ['Selisih', 13], ['Status', 11], ['Hal.', 6]];
    if (multi) cols.push(['File', 24]);
    cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
    ws.getRow(6).values = cols.map((c) => c[0]);
    styleHeader(ws.getRow(6));
    let r = 7;
    const acctBlocks = [];
    for (const doc of docs) {
      const groups = new Map();
      for (const a of doc.accounts) groups.set(a, []);
      for (const x of doc.rows) { if (!groups.has(x.acct)) groups.set(x.acct, []); groups.get(x.acct).push(x); }
      for (const [a, rows] of groups) {
        const sg = a.normal === 'K' ? -1 : 1;
        const openRow = r;
        ws.getRow(r).values = [a.code, a.name, rows[0] && rows[0].date ? toDate(rows[0].date) : null, '', `SALDO AWAL${a.openingDerived ? ' (dihitung mundur)' : ''}`, null, null, a.openingUsed || 0, f(`H${r}`, a.openingUsed || 0), null, 'Saldo awal', '', ...(multi ? [doc.fileName] : [])];
        ws.getRow(r).eachCell({ includeEmpty: true }, (c, i) => { if (i <= cols.length) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.open } }; c.font = { italic: true, bold: i <= 2, color: { argb: 'FF2E4448' } }; c.border = border; } });
        r++;
        const first = r;
        for (const x of rows) {
          const R = ws.getRow(r);
          R.values = [
            a.code, a.name, toDate(x.date), x.ref || '', x.desc, x.debit, x.kredit, x.saldo,
            f(sg === 1 ? `IF(H${r - 1}<>"",H${r - 1},I${r - 1})+N(F${r})-N(G${r})` : `IF(H${r - 1}<>"",H${r - 1},I${r - 1})-N(F${r})+N(G${r})`, x.calc),
            f(`IF(H${r}="","",H${r}-I${r})`, x.diff == null ? '' : x.diff),
            f(`IF(H${r}="","-",IF(ABS(H${r}-I${r})<0.005,"OK","SELISIH"))`, x.saldo == null ? '-' : x.status === 'err' ? 'SELISIH' : 'OK'),
            x.page, ...(multi ? [doc.fileName] : []),
          ];
          R.eachCell({ includeEmpty: true }, (c, i) => { if (i <= cols.length) c.border = border; });
          const note = x.notes && x.notes.length ? x.notes.join(' · ') : undefined;
          if (x.sus.debit) markSus(R.getCell(6), note);
          if (x.sus.kredit) markSus(R.getCell(7), note);
          if (x.sus.saldo) markSus(R.getCell(8), note);
          r++;
        }
        acctBlocks.push({ a, doc, openRow, first, last: r - 1 });
      }
    }
    const lastData = r - 1;
    for (const col of ['F', 'G', 'H', 'I', 'J']) ws.getColumn(col).numFmt = NUM;
    ws.getColumn('C').numFmt = DATE;
    ws.getColumn('E').alignment = { wrapText: true, vertical: 'top' };
    ws.getColumn('K').alignment = { horizontal: 'center' };
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastData, column: cols.length } };
    statusRules(ws, `A7:${String.fromCharCode(64 + cols.length)}${lastData}`, 'K', 7);

    // --- Ringkasan akun
    const rs = wb.addWorksheet('Ringkasan Akun', { views: [{ state: 'frozen', ySplit: 4 }] });
    titleBlock(rs, ['Ringkasan & Rekonsiliasi per Akun', 'Total dan saldo akhir dihitung ulang dengan rumus dari sheet Buku Besar, lalu dibandingkan dengan angka Total/Saldo Akhir yang tercetak di PDF.']);
    const hcols = [['No. Akun', 11], ['Nama Akun', 26], ['Saldo Normal', 11], ['Saldo Awal', 18], ['Total Debit (hitung)', 18], ['Total Kredit (hitung)', 18], ['Saldo Akhir (hitung)', 18], ['Total Debit (PDF)', 18], ['Total Kredit (PDF)', 18], ['Saldo Akhir (PDF)', 18], ['Baris Selisih', 10], ['Status', 12]];
    hcols.forEach(([, w], i) => (rs.getColumn(i + 1).width = w));
    rs.getRow(4).values = hcols.map((c) => c[0]);
    styleHeader(rs.getRow(4));
    let y = 5;
    for (const b of acctBlocks) {
      const a = b.a, P = a.printed || {}, R = a.result || {};
      const has = b.last >= b.first;
      rs.getRow(y).values = [
        a.code, a.name, a.normal === 'K' ? 'Kredit' : 'Debit', f(`'Buku Besar'!H${b.openRow}`, a.openingUsed || 0),
        f(has ? `SUM('Buku Besar'!F${b.first}:F${b.last})` : '0', R.sumD), f(has ? `SUM('Buku Besar'!G${b.first}:G${b.last})` : '0', R.sumK),
        f(`D${y}+IF(C${y}="Kredit",-1,1)*(E${y}-F${y})`, R.closingCalc),
        P.debit == null ? null : P.debit, P.credit == null ? null : P.credit, P.closing == null ? null : P.closing,
        f(has ? `COUNTIF('Buku Besar'!K${b.first}:K${b.last},"SELISIH")` : '0', R.bad),
        f(`IF(AND(K${y}=0,OR(H${y}="",ABS(H${y}-E${y})<0.005),OR(I${y}="",ABS(I${y}-F${y})<0.005),OR(J${y}="",ABS(ABS(J${y})-ABS(G${y}))<0.005)),"COCOK","SELISIH")`, R.bad || (R.issues && R.issues.length) ? 'SELISIH' : 'COCOK'),
      ];
      rs.getRow(y).eachCell({ includeEmpty: true }, (c, i) => { if (i <= hcols.length) c.border = border; });
      y++;
    }
    const last = y - 1;
    const gD = round(docs.reduce((s, d) => s + d.totals.sumD, 0)), gK = round(docs.reduce((s, d) => s + d.totals.sumK, 0));
    rs.getRow(y).values = ['', 'TOTAL SEMUA AKUN', '', '', f(`SUM(E5:E${last})`, gD), f(`SUM(F5:F${last})`, gK), '', '', '', '', '', f(`IF(ABS(E${y}-F${y})<0.005,"SEIMBANG","TIDAK SEIMBANG")`, Math.abs(gD - gK) < 0.005 ? 'SEIMBANG' : 'TIDAK SEIMBANG')];
    rs.getRow(y).eachCell({ includeEmpty: true }, (c) => { c.font = { bold: true }; c.border = { top: { style: 'medium', color: { argb: C.ink } } }; });
    rs.getCell(`A${y + 1}`).value = 'Total debit harus sama dengan total kredit bila PDF berisi seluruh akun. Bila hanya sebagian akun, "TIDAK SEIMBANG" wajar.';
    rs.getCell(`A${y + 1}`).font = { italic: true, size: 9, color: { argb: 'FF4A5D60' } };
    ['D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach((c) => (rs.getColumn(c).numFmt = NUM));
    rs.getColumn('K').numFmt = INT;
    statusCellRules(rs, `L5:L${y}`);
    let z = y + 3;
    rs.getCell(`A${z}`).value = 'Catatan pemeriksaan otomatis:'; rs.getCell(`A${z}`).font = { bold: true }; z++;
    for (const d of docs) for (const c of d.checks) { rs.getCell(`A${z}`).value = `${multi ? d.fileName + ': ' : ''}${c.level === 'ok' ? '✔' : c.level === 'error' ? '✖' : c.level === 'warn' ? '!' : 'i'}  ${c.title} — ${c.detail}`; z++; }
  }

  function round(v) { return Math.round(v * 100) / 100; }

  /** docs: hasil ConPExEngine.parse (sudah dicek). Return ArrayBuffer .xlsx */
  /** Sheet pertama: murni hasil convert, tanpa kolom cek/analisis. */
  function plainSheet(wb, docs) {
    const banks = docs.filter((d) => d.docType === 'bank');
    const gls = docs.filter((d) => d.docType === 'gl');
    const multi = docs.length > 1;
    const ws = wb.addWorksheet('Hasil Convert', { views: [{ state: 'frozen', ySplit: 1 }] });
    const hasRef = docs.some((d) => d.rows.some((x) => x.ref));
    let cols;
    if (gls.length && !banks.length) {
      cols = [['No. Akun', 11, (x) => x.account || ''], ['Nama Akun', 24, (x) => x.accountName || (x.acct && x.acct.name) || ''], ['Tanggal', 12, (x) => toDate(x.date)], ['No. Bukti', 14, (x) => x.ref || ''],
        ['Keterangan', 46, (x) => x.desc], ['Debit', 17, (x) => x.debit], ['Kredit', 17, (x) => x.kredit], ['Saldo', 18, (x) => x.saldo]];
    } else {
      cols = [['Tanggal', 12, (x) => toDate(x.date)], ['Keterangan', 52, (x) => x.desc], ...(hasRef ? [['Ref / Cabang', 14, (x) => x.ref || '']] : []),
        ['Debit', 17, (x) => x.debit], ['Kredit', 17, (x) => x.kredit], ['Saldo', 18, (x) => x.saldo]];
      if (gls.length) cols.unshift(['No. Akun', 11, (x) => x.account || '']);
    }
    if (multi) cols.push(['File', 26, null]);
    cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
    ws.getRow(1).values = cols.map((c) => c[0]);
    styleHeader(ws.getRow(1));
    let r = 2;
    for (const d of docs) for (const x of d.rows) {
      ws.getRow(r).values = cols.map(([, , fn]) => (fn ? fn(x) : d.fileName));
      r++;
    }
    cols.forEach(([name], i) => {
      const c = ws.getColumn(i + 1);
      if (/^(Debit|Kredit|Saldo)$/.test(name)) c.numFmt = NUM;
      if (name === 'Tanggal') c.numFmt = DATE;
      if (name === 'Keterangan') c.alignment = { wrapText: true, vertical: 'top' };
    });
    if (r > 2) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: r - 1, column: cols.length } };
  }

  /** opts: {income: true|false} — sertakan analisis uang masuk bila datanya ada. */
  async function build(docs, continuity, opts = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ConPEx';
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    const banks = docs.filter((d) => d.docType === 'bank');
    const gls = docs.filter((d) => d.docType === 'gl');
    plainSheet(wb, docs);
    if (banks.length) bankSheets(wb, banks, continuity, opts);
    if (gls.length) glSheets(wb, gls);
    return wb.xlsx.writeBuffer();
  }

  return { build };
});
