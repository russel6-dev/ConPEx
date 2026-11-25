/* ConPEx — halaman konverter (UI). Logika baca & cek ada di engine.js, Excel di excel.js. */
(() => {
  'use strict';
  const E = window.ConPExEngine;
  const I = window.ConPExIncome;
  const X = window.ConPExExcel;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtDate = (d) => (d ? `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}` : '');
  const extUrl = (p) => (window.chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL(p) : new URL(p, location.href).href);

  pdfjsLib.GlobalWorkerOptions.workerSrc = extUrl('lib/pdf.worker.min.js');
  // dibuka langsung dari folder (file://) dan bukan sebagai extension: OCR tidak bisa jalan
  if (location.protocol === 'file:') { $('#fileWarn').hidden = false; }

  const state = { items: [], active: null, continuity: [], onlyIssues: false, running: false };
  let seq = 1, newRowId = 1e7;

  // ------------------------------------------------------------------ opsi
  const optType = $('#optType'), optBank = $('#optBank'), optOcr = $('#optOcr');
  for (const b of E.BANKS) optBank.insertAdjacentHTML('beforeend', `<option value="${esc(b)}">${esc(b)}</option>`);
  optBank.insertAdjacentHTML('beforeend', '<option value="Lainnya">Bank lain (mode umum)</option>');
  const optInc = $('#optInc');
  const opts = () => ({ docType: optType.value, bank: optBank.value, ocr: optOcr.value, inc: optInc.value });
  const incOn = () => optInc.value === 'on';
  try {
    const saved = JSON.parse(localStorage.getItem('conpex-opts') || '{}');
    if (saved.docType) optType.value = saved.docType;
    if (saved.bank) optBank.value = saved.bank;
    if (saved.ocr) optOcr.value = saved.ocr;
    if (saved.inc) optInc.value = saved.inc;
  } catch (e) { /* abaikan */ }
  for (const el of [optType, optBank, optOcr]) el.addEventListener('change', () => {
    try { localStorage.setItem('conpex-opts', JSON.stringify(opts())); } catch (e) { /* abaikan */ }
    $('#btnReprocess').hidden = !state.items.length;
  });
  // analisis uang masuk tidak perlu proses ulang PDF
  optInc.addEventListener('change', () => {
    try { localStorage.setItem('conpex-opts', JSON.stringify(opts())); } catch (e) { /* abaikan */ }
    applyIncome();
    if (doneDocs().length) { renderResults(); toast(incOn() ? 'Analisis uang masuk dinyalakan. Lihat kolom "Uang masuk" di tabel.' : 'Analisis uang masuk dimatikan. Excel hanya berisi hasil convert & pengecekan.'); }
  });

  // ------------------------------------------------------------------ aturan uang masuk (buatan pengguna)
  const loadRules = () => { try { return JSON.parse(localStorage.getItem('conpex-rules') || '[]'); } catch (e) { return []; } };
  const saveRules = (r) => { try { localStorage.setItem('conpex-rules', JSON.stringify(r)); } catch (e) { /* abaikan */ } };
  let userRules = loadRules();
  state.incFilter = '';
  function applyIncome() {
    if (!incOn()) return;
    for (const d of doneDocs()) if (d.docType === 'bank') I.analyze(d, { userRules });
  }
  $('#btnReprocess').addEventListener('click', () => {
    for (const it of state.items) if (it.status !== 'password') { it.status = 'wait'; it.doc = null; it.msg = ''; }
    $('#btnReprocess').hidden = true;
    run();
  });

  // ------------------------------------------------------------------ toast
  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), Math.max(3200, msg.length * 60));
  }

  // ------------------------------------------------------------------ unggah
  const drop = $('#drop'), input = $('#fileInput');
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  async function addFiles(list) {
    const files = Array.from(list || []).filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!files.length) { toast('File yang dipilih bukan PDF. ConPEx hanya bisa membaca file berakhiran .pdf.'); return; }
    for (const f of files) state.items.push({ id: seq++, name: f.name, data: await f.arrayBuffer(), status: 'wait', msg: '', progress: 0, doc: null });
    renderFiles();
    run();
  }

  function addBuffer(name, buf) {
    state.items.push({ id: seq++, name, data: buf, status: 'wait', msg: '', progress: 0, doc: null });
    renderFiles();
    run();
  }

  $('#btnClear').addEventListener('click', () => {
    if (state.running) { toast('Masih memproses PDF. Tunggu sampai selesai, lalu coba lagi.'); return; }
    state.items = []; state.active = null; state.continuity = [];
    renderFiles(); renderResults();
  });

  // ------------------------------------------------------------------ PDF dari tab
  const src = new URLSearchParams(location.search).get('src');
  if (src) {
    $('#srcCard').hidden = false;
    $('#srcUrl').textContent = src;
    $('#btnSrc').addEventListener('click', async () => {
      const help = $('#srcHelp');
      help.hidden = true;
      try {
        const u = new URL(src);
        if (u.protocol !== 'file:' && chrome.permissions) {
          const ok = await chrome.permissions.request({ origins: [u.origin + '/*'] });
          if (!ok) { help.textContent = 'Izin tidak diberikan. Anda tetap bisa mengunduh PDF-nya lalu menyeretnya ke kotak di atas.'; help.hidden = false; return; }
        }
        const res = await fetch(src, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (!/pdf/i.test(res.headers.get('content-type') || 'pdf')) throw new Error('bukan PDF');
        const buf = await res.arrayBuffer();
        const name = decodeURIComponent(u.pathname.split('/').pop() || 'dokumen.pdf');
        $('#srcCard').hidden = true;
        addBuffer(name, buf);
      } catch (e) {
        help.textContent = src.startsWith('file:')
          ? 'File lokal tidak bisa dibaca langsung. Seret file PDF-nya ke kotak di atas, atau aktifkan "Izinkan akses ke URL file" untuk ConPEx di chrome://extensions.'
          : 'PDF dari tab ini tidak bisa diambil otomatis (biasanya karena sesi login bank sudah habis). Unduh PDF-nya dulu (tombol unduh di viewer PDF), lalu seret file-nya ke kotak di atas.';
        help.hidden = false;
      }
    });
  }

  // ------------------------------------------------------------------ OCR
  let ocrWorkerP = null, ocrProgress = null;
  function getOcr() {
    if (!ocrWorkerP) {
      ocrWorkerP = (async () => {
        const w = await Tesseract.createWorker(['ind', 'eng'], 1, {
          workerPath: extUrl('lib/tesseract/worker.min.js'),
          corePath: extUrl('lib/tesseract/core'),
          langPath: extUrl('lib/tesseract/lang'),
          workerBlobURL: false, gzip: true, cacheMethod: 'none',
          logger: (m) => { if (m.status === 'recognizing text' && ocrProgress) ocrProgress(m.progress); },
        });
        await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
        return w;
      })();
      ocrWorkerP.catch(() => { ocrWorkerP = null; });
    }
    return ocrWorkerP;
  }

  async function ocrPage(page, onProg) {
    const worker = await getOcr();
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3.2, Math.max(1.6, 2400 / vp1.width));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    ocrProgress = onProg;
    const { data } = await worker.recognize(canvas);
    ocrProgress = null;
    return { words: E.wordsFromOcr(data), width: canvas.width };
  }

  // ------------------------------------------------------------------ proses
  async function run() {
    if (state.running) return;
    state.running = true;
    try {
      let it;
      while ((it = state.items.find((x) => x.status === 'wait'))) await processItem(it);
    } finally { state.running = false; }
    state.continuity = E.checkContinuity(doneDocs());
    applyIncome();
    if (!state.active || !state.items.some((x) => x.id === state.active && x.doc)) {
      const first = state.items.find((x) => x.doc);
      state.active = first ? first.id : null;
    }
    renderFiles();
    renderResults();
  }

  let renderT = 0;
  const renderFilesSoon = () => { const now = Date.now(); if (now - renderT > 150) { renderT = now; renderFiles(); } };

  async function processItem(it) {
    const o = opts();
    it.status = 'busy'; it.msg = 'Membuka PDF…'; it.progress = 0; renderFiles();
    try {
      const pdf = await pdfjsLib.getDocument({ data: it.data.slice(0), password: it.password || undefined, isEvalSupported: false }).promise;
      const n = pdf.numPages, pages = [];
      let ocrCount = 0;
      for (let p = 1; p <= n; p++) {
        it.msg = `Membaca halaman ${p} dari ${n}`; it.progress = (p - 1) / n; renderFilesSoon();
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items = tc.items.map((x) => {
          const tx = pdfjsLib.Util.transform(vp.transform, x.transform);
          return { str: x.str, x: tx[4], y: tx[5], w: x.width, h: Math.hypot(tx[2], tx[3]) };
        });
        const words = E.wordsFromTextItems(items);
        // halaman dianggap hasil scan bila hampir tidak punya teks digital
        const textChars = words.reduce((n, w) => n + w.t.length, 0);
        const digitWords = words.filter((w) => /\d/.test(w.t)).length;
        if (o.ocr === 'force' || textChars < 40 || (digitWords < 3 && textChars < 200)) {
          if (location.protocol === 'file:') throw new Friendly(`Halaman ${p} adalah hasil scan, dan scan hanya bisa dibaca bila ConPEx dipasang sebagai extension.`, 'Jangan klik dua kali app.html. Ikuti petunjuk merah di atas halaman ini.');
          ocrCount++;
          it.msg = `OCR (scan) halaman ${p} dari ${n}${ocrCount === 1 ? ' — pertama kali butuh beberapa detik' : ''}`; renderFiles();
          let r;
          try { r = await ocrPage(page, (pr) => { it.progress = (p - 1 + pr) / n; renderFilesSoon(); }); }
          catch (err) { const f = friendlyError(err, 'ocr'); throw new Friendly(f.title, f.hint, err); }
          pages.push({ page: p, words: r.words, width: r.width, ocr: true });
        } else {
          pages.push({ page: p, words, width: vp.width, height: vp.height, ocr: false });
        }
        page.cleanup();
      }
      pdf.destroy();
      try { it.doc = E.parse(pages, { fileName: it.name, docType: o.docType, bank: o.bank }); }
      catch (err) { const f = friendlyError(err, 'parse'); throw new Friendly(f.title, f.hint, err); }
      it.status = 'done'; it.progress = 1;
      it.msg = `${n} halaman · ${it.doc.rows.length} transaksi${ocrCount ? ` · ${ocrCount} halaman OCR` : ''}`;
    } catch (e) {
      if (e && e.name === 'PasswordException') {
        it.status = 'password';
        it.msg = e.code === 2 ? 'Password salah. Coba ketik ulang (perhatikan huruf besar/kecil).' : 'PDF ini dikunci password. Biasanya e-statement bank memakai password seperti tanggal lahir (mis. 01011990). Ketik di bawah lalu klik Buka.';
      } else {
        it.status = 'error';
        const f = friendlyError(e);
        it.msg = f.title; it.hint = f.hint; it.tech = f.tech;
        if (location.protocol === 'file:') $('#fileWarn').scrollIntoView({ behavior: 'smooth' });
        console.error(e);
      }
    }
    renderFiles();
  }

  const doneDocs = () => state.items.filter((x) => x.doc).map((x) => x.doc);

  /** Error yang sudah berbahasa sederhana (judul + saran). */
  class Friendly extends Error {
    constructor(title, hint, cause) { super(title); this.title = title; this.hint = hint; this.cause = cause; }
  }

  /** Ubah error teknis menjadi {title, hint, tech} yang mudah dimengerti. */
  function friendlyError(e, stage) {
    if (e instanceof Friendly) return { title: e.title, hint: e.hint, tech: e.cause ? String(e.cause.message || e.cause) : '' };
    const tech = `${(e && e.name) || 'Error'}: ${(e && e.message) || e}`;
    const m = String((e && e.message) || e).toLowerCase();
    const name = (e && e.name) || '';
    if (location.protocol === 'file:' && (/worker|origin 'null'|file:\/\//.test(m)))
      return { title: 'ConPEx belum dipasang sebagai extension.', hint: 'Jangan klik dua kali app.html. Ikuti petunjuk merah di atas halaman ini.', tech };
    if (name === 'InvalidPDFException' || /invalid pdf|bad xref|not a pdf/.test(m))
      return { title: 'File ini bukan PDF yang bisa dibaca, atau filenya rusak.', hint: 'Coba unduh ulang PDF-nya dari internet banking / sumber aslinya, lalu proses lagi.', tech };
    if (name === 'MissingPDFException' || /empty|zero/.test(m) && /pdf|file/.test(m))
      return { title: 'File PDF-nya kosong.', hint: 'Unduh ulang PDF-nya, lalu coba lagi.', tech };
    if (name === 'RangeError' || /out of memory|allocation|memory/.test(m))
      return { title: 'PDF ini terlalu besar untuk diproses sekaligus.', hint: 'Tutup tab lain lalu coba lagi, atau pecah PDF-nya (mis. per bulan).', tech };
    if (stage === 'ocr' || /tesseract|wasm|traineddata|createworker/.test(m))
      return { title: 'Mesin pembaca scan (OCR) gagal berjalan.', hint: 'Muat ulang halaman ini (tekan F5) lalu coba lagi. Jika tetap gagal, pasang ulang ConPEx dari ZIP terbaru.', tech };
    if (stage === 'parse')
      return { title: 'PDF berhasil dibuka, tapi isinya gagal disusun jadi tabel.', hint: 'Coba pilih "Jenis dokumen" dan "Bank" secara manual lalu klik "Proses ulang". Jika tetap gagal, kirim info nama bank & jenis dokumennya ke pembuat ConPEx.', tech };
    return { title: 'Terjadi kendala saat membaca PDF ini.', hint: 'Coba proses ulang. Jika tetap gagal, kirim "Detail teknis" di bawah ke pembuat ConPEx.', tech };
  }

  // ------------------------------------------------------------------ daftar file
  function renderFiles() {
    $('#filesSec').hidden = !state.items.length;
    drop.classList.toggle('compact', state.items.length > 0);
    $('.drop-title').textContent = state.items.length ? 'Tambah PDF lain (seret atau klik)' : 'Seret PDF ke sini, atau klik untuk memilih';
    const ul = $('#fileList');
    ul.innerHTML = state.items.map((it) => {
      const st = it.status === 'done' ? it.doc.status : it.status;
      const label = { wait: 'Menunggu', busy: 'Diproses', password: 'Butuh password', error: 'Gagal', ok: 'Cocok', warn: 'Perlu dicek', }[st] || (st === 'error' ? 'Ada selisih' : st);
      const cls = { wait: 'wait', busy: 'busy', password: 'warn', ok: 'ok', warn: 'warn', error: 'error' }[st] || 'wait';
      const pillText = it.status === 'done' && st === 'error' ? 'Ada selisih' : label;
      return `<li class="file" data-id="${it.id}">
        <div><div class="file-name" title="${esc(it.name)}">${esc(it.name)}</div><div class="file-msg${it.status === 'error' ? ' bad' : ''}">${esc(it.msg)}</div>
          ${it.status === 'error' && it.hint ? `<div class="file-hint"><b>Yang bisa dilakukan:</b> ${esc(it.hint)}</div>` : ''}
          ${it.status === 'error' && it.tech ? `<details class="tech"><summary>Detail teknis</summary><code>${esc(it.tech)}</code></details>` : ''}</div>
        <span class="pill ${cls}">${esc(pillText)}</span>
        ${it.status === 'busy' ? `<div class="bar"><i style="width:${Math.round(it.progress * 100)}%"></i></div>` : ''}
        ${it.status === 'password' ? `<form class="pw" data-id="${it.id}"><input type="password" id="pw-${it.id}" placeholder="Password PDF" autocomplete="off" aria-label="Password PDF ${esc(it.name)}"><button class="btn small" type="submit">Buka</button></form>` : ''}
      </li>`;
    }).join('');
  }
  $('#fileList').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = +e.target.dataset.id;
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    it.password = $(`#pw-${id}`).value;
    it.status = 'wait';
    run();
  });

  // ------------------------------------------------------------------ hasil
  function overall() {
    const docs = doneDocs();
    const levels = docs.map((d) => d.status).concat(state.continuity.map((c) => c.level));
    return levels.includes('error') ? 'error' : levels.includes('warn') ? 'warn' : 'ok';
  }

  function renderResults() {
    const docs = doneDocs();
    $('#results').hidden = !docs.length;
    if (!docs.length) return;
    renderBanner();
    renderContinuity();
    renderTabs();
    renderDoc();
  }

  function renderBanner() {
    const docs = doneDocs();
    const st = overall();
    const tx = docs.reduce((s, d) => s + d.rows.length, 0);
    const sumD = docs.reduce((s, d) => s + (d.totals.sumD || 0), 0);
    const sumK = docs.reduce((s, d) => s + (d.totals.sumK || 0), 0);
    const nErr = docs.reduce((s, d) => s + d.rows.filter((r) => r.status === 'err').length, 0);
    const nSus = docs.reduce((s, d) => s + d.rows.filter((r) => Object.keys(r.sus).length).length, 0);
    const title = st === 'ok' ? 'Semua angka cocok' : st === 'warn' ? (nSus ? `Angka cocok, ${nSus} baris perlu dicek manual` : 'Angka cocok, ada catatan yang perlu dicek (lihat Hasil pengecekan)') : `Ada selisih${nErr ? ` di ${nErr} baris` : ''}. Periksa tanda merah.`;
    const b = $('#banner');
    b.className = 'banner ' + st;
    b.innerHTML = `
      <div class="mark" aria-hidden="true">${st === 'ok' ? '✓' : st === 'warn' ? '!' : '✕'}</div>
      <div>
        <div class="banner-title">${esc(title)}</div>
        <div class="stats">
          <span>${docs.length} file</span>
          <span>Transaksi <b>${tx.toLocaleString('id-ID')}</b></span>
          <span>Total debit <b>${fmt(sumD)}</b></span>
          <span>Total kredit <b>${fmt(sumK)}</b></span>
        </div>
      </div>
      <div class="banner-actions">
        <button id="btnXlsx" class="btn big" type="button">Unduh Excel${docs.length > 1 ? ' (semua file)' : ''}</button>
        <span class="muted small">Berisi rumus cek &amp; sheet ${docs.some((d) => d.docType === 'gl') ? 'Ringkasan Akun' : 'Rekonsiliasi'}</span>
      </div>`;
    $('#btnXlsx').addEventListener('click', () => download(docs, state.continuity));
  }

  function renderContinuity() {
    const el = $('#contin');
    el.hidden = !state.continuity.length;
    el.innerHTML = state.continuity.length ? `<ul class="checks">${state.continuity.map(checkLi).join('')}</ul>` : '';
  }

  function renderTabs() {
    const items = state.items.filter((x) => x.doc);
    const nav = $('#tabs');
    nav.hidden = items.length < 2;
    nav.innerHTML = items.map((it) => `<button class="tab" type="button" role="tab" data-id="${it.id}" aria-selected="${it.id === state.active}"><i class="dot ${it.doc.status}"></i><span class="t">${esc(it.name)}</span></button>`).join('');
  }
  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    state.active = +t.dataset.id;
    renderTabs(); renderDoc();
  });

  const activeDoc = () => { const it = state.items.find((x) => x.id === state.active); return it && it.doc; };

  function checkLi(c) {
    const ic = { ok: '✓', error: '✕', warn: '!', info: 'i' }[c.level];
    return `<li class="check ${c.level}${c.rows && c.rows.length ? ' link' : ''}" ${c.rows && c.rows.length ? `data-rows="${c.rows.join(',')}" tabindex="0" role="button"` : ''}>
      <span class="ic" aria-hidden="true">${ic}</span>
      <div><div class="check-title">${esc(c.title)}</div><div class="check-detail">${esc(c.detail)}</div></div></li>`;
  }

  function renderDoc() {
    const doc = activeDoc();
    const v = $('#docView');
    if (!doc) { v.innerHTML = ''; return; }
    const isGL = doc.docType === 'gl';
    v.innerHTML = `<div class="doc">
      <div class="doc-top">
        <div class="panel">
          <h3>${isGL ? 'Buku besar' : 'Rekening koran'}</h3>
          <div class="meta">
            ${isGL ? '' : `<label>Bank<input id="m-bank" value="${esc(doc.bank)}"></label>`}
            ${isGL ? '' : `<label>No. rekening<input id="m-accountNo" value="${esc(doc.meta.accountNo)}"></label>`}
            <label>${isGL ? 'Perusahaan / nama' : 'Nama'}<input id="m-name" value="${esc(doc.meta.name)}"></label>
            <label>Periode<input id="m-period" value="${esc(doc.meta.period)}"></label>
          </div>
          <div class="doc-actions">
            <span class="muted small">Jenis terdeteksi: <b>${isGL ? 'Buku besar' : 'Rekening koran'}</b> · ${doc.pageCount} halaman${doc.ocrPages ? ` (${doc.ocrPages} OCR)` : ''}</span>
            ${doneDocs().length > 1 ? '<button id="btnXlsxOne" class="btn ghost small" type="button">Unduh Excel file ini saja</button>' : ''}
          </div>
        </div>
        <div class="panel">
          <h3>Hasil pengecekan</h3>
          <ul class="checks" id="checkList">${doc.checks.map(checkLi).join('')}</ul>
        </div>
      </div>
      ${incOn() && !isGL ? incomePanel(doc) : ''}
      <div>
        <div class="tbl-tools">
          <label><input type="checkbox" id="onlyIssues" ${state.onlyIssues ? 'checked' : ''}> Tampilkan hanya baris yang perlu dicek</label>
          <span class="muted small">Klik sel untuk mengedit · ⇄ tukar debit/kredit · ＋ sisip baris · ✕ hapus baris</span>
        </div>
        <div class="tbl-wrap" id="tblWrap">${tableHtml(doc)}</div>
      </div>
    </div>`;
    for (const k of ['bank', 'accountNo', 'name', 'period']) {
      const el = $('#m-' + k);
      if (el) el.addEventListener('input', () => { if (k === 'bank') doc.bank = el.value; else doc.meta[k] = el.value; });
    }
    const one = $('#btnXlsxOne');
    if (one) one.addEventListener('click', () => download([doc], []));
    $('#onlyIssues').addEventListener('change', (e) => { state.onlyIssues = e.target.checked; $('#tblWrap').innerHTML = tableHtml(doc); });
  }

  const CAT_KEYS = ['usaha', 'bunga', 'non', 'cek'];
  function incomePanel(doc) {
    const sum = I.summarize([doc]);
    const total = CAT_KEYS.reduce((t, c) => t + sum.byCat[c].total, 0);
    const chips = CAT_KEYS.map((c) => `<button type="button" class="chip cat-${c}${state.incFilter === c ? ' on' : ''}" data-a="incfilter" data-cat="${c}" aria-pressed="${state.incFilter === c}">
        <span class="chip-name">${esc(I.CATS[c])}</span><b>${fmt(sum.byCat[c].total)}</b><span class="chip-sub">${sum.byCat[c].count} transaksi · ${total ? Math.round((sum.byCat[c].total / total) * 100) : 0}%</span></button>`).join('');
    const rules = userRules.map((r, i) => `<li><span class="rule-text">"${esc(r.text)}"</span> → <span class="tagcat cat-${r.cat}">${esc(I.CATS[r.cat])}</span><button type="button" class="linkbtn" data-a="delrule" data-i="${i}" aria-label="Hapus aturan">hapus</button></li>`).join('');
    return `<div class="panel inc-panel">
      <div class="inc-head"><h3>Analisis uang masuk</h3><span class="muted small">Indikasi otomatis dari keterangan bank, bukan kesimpulan pajak. Klik kotak untuk menyaring tabel.${state.incFilter ? ' <button type="button" class="linkbtn" data-a="incfilter" data-cat="">Tampilkan semua</button>' : ''}</span></div>
      <div class="chips">${chips}</div>
      <details class="rules" id="rulesBox" ${state.rulesOpen ? 'open' : ''}>
        <summary>Aturan Anda (${userRules.length}) — selalu menang atas deteksi otomatis</summary>
        <form class="rule-form" id="ruleForm">
          <label>Jika keterangan berisi<input id="ruleText" placeholder="mis. PT ABC, PINJAMAN DIREKTUR" autocomplete="off"></label>
          <label>maka kategori<select id="ruleCat">${CAT_KEYS.map((c) => `<option value="${c}">${esc(I.CATS[c])}</option>`).join('')}</select></label>
          <button class="btn small" type="submit">Tambah aturan</button>
        </form>
        ${userRules.length ? `<ul class="rule-list">${rules}</ul>` : '<p class="muted small">Belum ada aturan. Ganti kategori sebuah transaksi di tabel, lalu klik "＋ jadikan aturan".</p>'}
      </details>
    </div>`;
  }

  function incCell(r) {
    if (!r.kredit || !r.inc) return '<td class="inc"></td>';
    const opts = CAT_KEYS.map((c) => `<option value="${c}"${r.inc.cat === c ? ' selected' : ''}>${esc(I.CATS[c])}</option>`).join('');
    return `<td class="inc" title="${esc(r.inc.reason)}"><select class="inc-sel cat-${r.inc.cat}" data-a="inc" aria-label="Kategori uang masuk">${opts}</select>
      <span class="inc-why">${esc(r.inc.manual ? 'dipilih manual' : `${r.inc.jenis} · keyakinan ${r.inc.conf}`)}</span>
      ${r.inc.manual ? '<button type="button" class="linkbtn" data-a="mkrule">＋ jadikan aturan</button>' : ''}</td>`;
  }

  const issue = (r) => r.status === 'err' || Object.keys(r.sus).length > 0;

  function ckCell(r) {
    if (r.status === 'err') return `<span class="ck err" title="Saldo seharusnya ${fmt(r.calc)}">Selisih ${fmt(r.diff)}</span>`
      + (r.suggest ? `<button type="button" class="suggest" data-a="suggest" title="Saldo di PDF kemungkinan salah baca 1 angka">Pakai ${fmt(r.suggest.value)}?</button>` : '');
    if (r.status === 'ok' && r.saldo != null) return '<span class="ck ok">✓ cocok</span>';
    return '<span class="ck na">–</span>';
  }

  function rowHtml(r, i, isGL) {
    const sus = (f) => (r.sus[f] || (f !== 'saldo' && r.sus.side && ((f === 'debit' && r.debit) || (f === 'kredit' && r.kredit))) ? ' sus' : '');
    const ed = (field, val, cls) => `<td class="${cls}${sus(field)}" contenteditable="plaintext-only" spellcheck="false" data-f="${field}">${esc(val)}</td>`;
    const notes = r.notes && r.notes.length ? `<span class="note">${esc(r.notes.join(' · '))}</span>` : '';
    return `<tr data-id="${r.id}" class="${r.status === 'err' ? 'err' : ''}">
      <td class="idx">${i + 1}</td>
      ${ed('date', fmtDate(r.date), 'c-date')}
      ${ed('ref', r.ref, '')}
      <td class="desc" contenteditable="plaintext-only" spellcheck="false" data-f="desc">${esc(r.desc)}</td>
      ${ed('debit', fmt(r.debit), 'n')}
      ${ed('kredit', fmt(r.kredit), 'n')}
      ${ed('saldo', fmt(r.saldo), 'n')}
      <td class="cek">${ckCell(r)}${notes}</td>
      ${showInc(isGL) ? incCell(r) : ''}
      <td class="pg">${r.page}</td>
      <td class="row-act"><button type="button" data-a="swap" title="Tukar debit ↔ kredit" aria-label="Tukar debit dan kredit">⇄</button><button type="button" data-a="add" title="Sisipkan baris di bawah" aria-label="Sisipkan baris">＋</button><button type="button" data-a="del" title="Hapus baris" aria-label="Hapus baris">✕</button></td>
    </tr>`;
  }

  const showInc = (isGL) => incOn() && !isGL;
  function tableHtml(doc) {
    const isGL = doc.docType === 'gl';
    const inc = showInc(isGL);
    const NC = inc ? 11 : 10;
    const head = `<thead><tr><th>#</th><th>Tanggal</th><th>${isGL ? 'No. Bukti' : 'Ref / Cabang'}</th><th>Keterangan</th><th class="n">Debit</th><th class="n">Kredit</th><th class="n">Saldo</th><th>Cek</th>${inc ? '<th>Uang masuk</th>' : ''}<th>Hal</th><th></th></tr></thead>`;
    let body = '';
    let lastAcct = undefined;
    const show = (r) => (!state.onlyIssues || issue(r)) && (!inc || !state.incFilter || (r.kredit && r.inc && r.inc.cat === state.incFilter));
    const T = doc.totals || {};
    if (!isGL && T.opening != null) body += `<tr class="open"><td></td><td></td><td></td><td>SALDO AWAL${T.openingDerived ? ' (dihitung mundur)' : ''}</td><td></td><td></td><td class="n">${fmt(T.opening)}</td><td></td>${inc ? '<td></td>' : ''}<td></td><td></td></tr>`;
    doc.rows.forEach((r, i) => {
      if (isGL && r.acct !== lastAcct) {
        lastAcct = r.acct;
        const a = r.acct || {};
        const res = a.result || {};
        body += `<tr class="acct"><td colspan="${NC}">${esc(a.code || '')} ${esc(a.name || '')}<span class="acct-meta">saldo normal ${a.normal === 'K' ? 'kredit' : 'debit'} · saldo awal ${fmt(a.openingUsed)} · saldo akhir hitung ${fmt(res.closingCalc)}${res.issues && res.issues.length ? ' · ✕ ' + esc(res.issues.join('; ')) : ''}</span></td></tr>`;
      }
      if (show(r)) body += rowHtml(r, i, isGL);
    });
    if (doc.rows.length && !doc.rows.some(show)) body += `<tr><td colspan="${NC}" class="empty">Tidak ada transaksi yang cocok dengan saringan ini.</td></tr>`;
    if (!doc.rows.length) body = `<tr><td colspan="${NC}" class="empty">Tidak ada transaksi yang terbaca. Coba pilih jenis dokumen/bank secara manual atau "Paksa OCR", lalu klik "Proses ulang".</td></tr>`;
    const foot = `<tfoot><tr><td></td><td></td><td></td><td>TOTAL</td><td class="n">${fmt(T.sumD)}</td><td class="n">${fmt(T.sumK)}</td><td class="n">${isGL ? '' : fmt(T.lastSaldo)}</td><td colspan="${NC - 7}"></td></tr></tfoot>`;
    return `<table class="tx">${head}<tbody>${body}</tbody>${foot}</table>`;
  }

  // ------------------------------------------------------------------ edit tabel
  const docView = $('#docView');
  docView.addEventListener('keydown', (e) => {
    if (e.target.matches('td[contenteditable]') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.target.matches('.check.link') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
  });
  docView.addEventListener('focusout', (e) => {
    const td = e.target.closest && e.target.closest('td[contenteditable]');
    if (!td) return;
    const doc = activeDoc();
    const tr = td.closest('tr');
    const r = doc && doc.rows.find((x) => x.id === +tr.dataset.id);
    if (!r) return;
    const f = td.dataset.f;
    const text = td.textContent.trim();
    const old = f === 'date' ? fmtDate(r.date) : f === 'debit' || f === 'kredit' || f === 'saldo' ? fmt(r[f]) : r[f];
    if (text === String(old == null ? '' : old)) return;
    if (f === 'date') {
      if (!text) r.date = null;
      else {
        const d = E.parseDateText(text, r.date && r.date.y);
        if (!d) { toast('Tanggal tidak dikenali. Tulis seperti 05/11/2025.'); td.textContent = old; return; }
        r.date = d;
      }
    } else if (f === 'debit' || f === 'kredit' || f === 'saldo') {
      if (!text) r[f] = null;
      else {
        const p = E.parseAmount(text.replace(/\s/g, ''));
        if (!p) { toast('Angka tidak dikenali. Tulis seperti 1.250.000,00 (tanpa huruf).'); td.textContent = old; return; }
        r[f] = f === 'saldo' ? p.value : Math.abs(p.value) || null;
      }
      delete r.sus[f]; delete r.sus.side;
      r.notes = r.notes.filter((n) => !/dikoreksi|ditebak/.test(n));
    } else {
      r[f] = text;
    }
    afterEdit(doc, false);
  });

  docView.addEventListener('change', (e) => {
    const sel = e.target.closest('select.inc-sel');
    if (!sel) return;
    const doc = activeDoc();
    const r = doc.rows.find((x) => x.id === +sel.closest('tr').dataset.id);
    if (!r) return;
    const cat = sel.value;
    r.inc = { cat, label: I.CATS[cat], jenis: 'Dipilih manual', conf: 'tinggi', reason: 'dipilih manual', party: r.inc && r.inc.party, manual: true };
    rerenderKeepScroll();
    toast('Kategori diganti. Klik "＋ jadikan aturan" agar transaksi serupa ikut berubah.');
  });
  docView.addEventListener('submit', (e) => {
    if (e.target.id !== 'ruleForm') return;
    e.preventDefault();
    const text = $('#ruleText').value.trim();
    if (text.length < 2) { toast('Tulis kata/nama yang ada di keterangan, minimal 2 huruf.'); return; }
    const cat = $('#ruleCat').value;
    const before = new Map();
    for (const d of doneDocs()) for (const x of d.rows) if (x.inc) before.set(x.id, x.inc.cat);
    userRules = userRules.filter((r) => I.norm(r.text) !== I.norm(text)).concat([{ text, cat }]);
    saveRules(userRules);
    // baris yang dipilih manual & cocok dengan aturan baru ikut mengikuti aturan
    for (const d of doneDocs()) for (const x of d.rows) if (x.inc && x.inc.manual && (' ' + I.norm(x.desc) + ' ').includes(' ' + I.norm(text) + ' ')) delete x.inc;
    applyIncome();
    let changed = 0;
    for (const d of doneDocs()) for (const x of d.rows) if (x.inc && before.get(x.id) !== x.inc.cat) changed++;
    state.rulesOpen = true;
    rerenderKeepScroll();
    toast(`Aturan "${text}" ditambahkan${changed ? ` — ${changed} transaksi ikut berubah` : ''}. Aturan disimpan untuk file berikutnya.`);
  });
  function rerenderKeepScroll() {
    const wrap = $('#tblWrap'); const st = wrap ? wrap.scrollTop : 0; const y = window.scrollY;
    renderDoc(); const w2 = $('#tblWrap'); if (w2) w2.scrollTop = st; window.scrollTo(0, y);
  }

  docView.addEventListener('click', (e) => {
    const act = e.target.closest('[data-a="incfilter"], [data-a="mkrule"], [data-a="delrule"]');
    if (act) {
      const a = act.dataset.a;
      if (a === 'incfilter') { state.incFilter = state.incFilter === act.dataset.cat ? '' : act.dataset.cat; rerenderKeepScroll(); return; }
      if (a === 'delrule') {
        const i = +act.dataset.i; const removed = userRules[i];
        userRules.splice(i, 1); saveRules(userRules);
        applyIncome(); state.rulesOpen = true; rerenderKeepScroll();
        toast(`Aturan "${removed.text}" dihapus.`); return;
      }
      if (a === 'mkrule') {
        const doc = activeDoc();
        const r = doc.rows.find((x) => x.id === +act.closest('tr').dataset.id);
        state.rulesOpen = true; rerenderKeepScroll();
        const guess = I.keyPhrase(r.desc);
        $('#ruleText').value = guess; $('#ruleCat').value = r.inc.cat;
        $('#rulesBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('#ruleText').focus(); $('#ruleText').select();
        toast('Periksa kata kuncinya (boleh diubah), lalu klik "Tambah aturan".');
        return;
      }
    }
    const chk = e.target.closest('.check.link');
    if (chk) { jumpTo(chk.dataset.rows.split(',').map(Number)); return; }
    const sug = e.target.closest('button.suggest');
    if (sug) {
      const doc = activeDoc();
      const r = doc.rows.find((x) => x.id === +sug.closest('tr').dataset.id);
      if (r && r.suggest) {
        r[r.suggest.field] = r.suggest.value; r.sus[r.suggest.field] = true;
        r.notes = r.notes.filter((n) => !/dikoreksi/.test(n));
        r.notes.push('Saldo dikoreksi dari saran (OCR salah baca 1 angka) — cocokkan dengan PDF');
        afterEdit(doc, true); toast('Saldo diganti. Sel tetap kuning sebagai pengingat untuk dicocokkan dengan PDF.');
      }
      return;
    }
    const btn = e.target.closest('.row-act button');
    if (!btn) return;
    const doc = activeDoc();
    const id = +btn.closest('tr').dataset.id;
    const idx = doc.rows.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const r = doc.rows[idx];
    if (btn.dataset.a === 'swap') { [r.debit, r.kredit] = [r.kredit, r.debit]; const s = r.sus; [s.debit, s.kredit] = [s.kredit, s.debit]; delete r.sus.side; r.notes = r.notes.filter((n) => !/ditebak/.test(n)); }
    else if (btn.dataset.a === 'del') { doc.rows.splice(idx, 1); toast('Baris dihapus.'); }
    else if (btn.dataset.a === 'add') {
      const n = { id: newRowId++, page: r.page, file: r.file, date: r.date ? { ...r.date } : null, ref: '', desc: '', debit: null, kredit: null, saldo: null, sus: {}, notes: [], kind: 'tx', acct: r.acct, account: r.account, accountName: r.accountName };
      doc.rows.splice(idx + 1, 0, n);
    }
    afterEdit(doc, true);
  });

  function afterEdit(doc, full) {
    E.check(doc);
    applyIncome();
    state.continuity = E.checkContinuity(doneDocs());
    renderBanner(); renderContinuity(); renderTabs(); renderFiles();
    if (full) { const wrap = $('#tblWrap'); const st = wrap.scrollTop; renderDoc(); $('#tblWrap').scrollTop = st; return; }
    $('#checkList').innerHTML = doc.checks.map(checkLi).join('');
    const ip = $('.inc-panel');
    if (ip && incOn() && doc.docType === 'bank') { ip.outerHTML = incomePanel(doc); }
    // perbarui kolom cek & warna baris tanpa render ulang (agar fokus sel tidak hilang)
    for (const r of doc.rows) {
      const tr = $(`#tblWrap tr[data-id="${r.id}"]`);
      if (!tr) continue;
      tr.classList.toggle('err', r.status === 'err');
      const cek = tr.querySelector('td.cek');
      const notes = r.notes && r.notes.length ? `<span class="note">${esc(r.notes.join(' · '))}</span>` : '';
      cek.innerHTML = ckCell(r) + notes;
      for (const f of ['debit', 'kredit', 'saldo']) {
        const td = tr.querySelector(`td[data-f="${f}"]`);
        if (td && document.activeElement !== td) { td.classList.toggle('sus', !!r.sus[f]); td.textContent = fmt(r[f]); }
      }
    }
    const foot = $('#tblWrap tfoot');
    if (foot) foot.outerHTML = tableHtml(doc).match(/<tfoot>[\s\S]*<\/tfoot>/)[0];
  }

  function jumpTo(ids) {
    const wrap = $('#tblWrap');
    if (state.onlyIssues === false && ids.length > 1) { /* tetap tampil semua */ }
    let tr = null;
    for (const id of ids) { tr = wrap.querySelector(`tr[data-id="${id}"]`); if (tr) break; }
    if (!tr) { state.onlyIssues = false; renderDoc(); tr = $('#tblWrap').querySelector(`tr[data-id="${ids[0]}"]`); }
    if (!tr) return;
    $('#tblWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    for (const id of ids) { const t = $('#tblWrap').querySelector(`tr[data-id="${id}"]`); if (t) { t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } }
  }

  // ------------------------------------------------------------------ unduh Excel
  async function download(docs, continuity) {
    try {
      const buf = await X.build(docs, continuity, { income: incOn() });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const d = docs[0];
      const parts = ['ConPEx', d.docType === 'gl' ? 'BukuBesar' : d.bank, d.meta.accountNo, docs.length > 1 ? `${docs.length}file` : d.meta.period].filter(Boolean);
      const name = parts.join('_').replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 90) + '.xlsx';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
      toast(`Excel disimpan: ${name}`);
    } catch (e) {
      console.error(e);
      toast('Excel gagal dibuat. Coba klik "Unduh Excel" sekali lagi; jika tetap gagal, muat ulang halaman (F5) lalu proses ulang PDF-nya.');
    }
  }

  // akses untuk pengujian otomatis
  window.__conpex = { state, addBuffer };
})();
