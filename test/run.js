// Uji mesin ConPEx di Node terhadap PDF contoh.
// Pakai: NODE_PATH=<folder node_modules berisi pdfjs-dist@3.11.174> node test/run.js [file.pdf ...] [--rows]
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const E = require('../extension/engine.js');

async function pagesFromPdf(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.map((it) => {
      const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
      return { str: it.str, x: tx[4], y: tx[5], w: it.width, h: Math.hypot(tx[2], tx[3]) };
    });
    pages.push({ page: p, words: E.wordsFromTextItems(items), width: vp.width, height: vp.height, ocr: false });
  }
  return pages;
}

function summarize(doc, showRows) {
  console.log(`\n=== ${doc.fileName} | ${doc.docType} | bank=${doc.bank} | rows=${doc.rows.length} | status=${doc.status}`);
  console.log('meta', JSON.stringify(doc.meta), 'summary', JSON.stringify(doc.summary));
  for (const c of doc.checks) console.log(`  [${c.level}] ${c.title} — ${c.detail}`);
  if (doc.docType === 'gl') for (const a of doc.accounts) console.log(`  akun ${a.code} ${a.name} normal=${a.normal} open=${a.openingUsed} printed=${JSON.stringify(a.printed)}`);
  if (showRows) for (const r of doc.rows) console.log(`   ${r.page} ${r.date ? `${r.date.d}/${r.date.m}/${r.date.y}` : '-'} | ${r.account || ''} | ${r.ref} | ${r.desc.slice(0, 50)} | D=${r.debit} K=${r.kredit} S=${r.saldo} ${r.status}${r.notes.length ? ' ' + r.notes.join(';') : ''}`);
}

(async () => {
  const args = process.argv.slice(2);
  const showRows = args.includes('--rows');
  let files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) files = fs.readdirSync(path.join(__dirname, 'samples')).filter((f) => f.endsWith('.pdf') && !f.includes('scan') && !f.includes('password')).map((f) => path.join(__dirname, 'samples', f));
  const docs = [];
  for (const f of files) {
    const pages = await pagesFromPdf(f);
    const doc = E.parse(pages, { fileName: path.basename(f) });
    docs.push(doc);
    summarize(doc, showRows);
  }
  const cont = E.checkContinuity(docs);
  for (const c of cont) console.log(`[${c.level}] ${c.title}`);
})();
