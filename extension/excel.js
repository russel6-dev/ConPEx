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

  function bankSheets(wb, docs, continuity) {
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
        ];
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
      for (const c of continuity) {
        rs.getRow(y).values = [`${c.from} → ${c.to}`, c.endA, c.startB, f(`B${y}-C${y}`, round(c.endA - c.startB)), f(`IF(ABS(B${y}-C${y})<0.005,"COCOK","SELISIH")`, c.ok ? 'COCOK' : 'SELISIH')];
        ['B', 'C', 'D'].forEach((k) => (rs.getCell(`${k}${y}`).numFmt = NUM));
        y++;
      }
      statusCellRules(rs, `E${s0}:E${y - 1}`);
    }
  }

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
  async function build(docs, continuity) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ConPEx';
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    const banks = docs.filter((d) => d.docType === 'bank');
    const gls = docs.filter((d) => d.docType === 'gl');
    if (banks.length) bankSheets(wb, banks, continuity);
    if (gls.length) glSheets(wb, gls);
    return wb.xlsx.writeBuffer();
  }

  return { build };
});
