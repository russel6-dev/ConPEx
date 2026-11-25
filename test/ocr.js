// Uji jalur OCR: baca PNG hasil scan dengan Tesseract (sama seperti di extension) lalu parse.
// NODE_PATH=<node_modules berisi tesseract.js@5> node test/ocr.js bca_nov2025
const path = require('path');
const fs = require('fs');
const { createWorker } = require('tesseract.js');
const E = require('../extension/engine.js');
const { imageSize } = (() => { try { return require('image-size'); } catch { return {}; } })();

(async () => {
  const name = process.argv[2] || 'bca_nov2025';
  const dir = path.join(__dirname, 'samples');
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(name + '_scan_p') && f.endsWith('.png')).sort();
  const worker = await createWorker(['ind', 'eng'], 1, { langPath: path.join(__dirname, '../extension/lib/tesseract/lang'), gzip: true, cacheMethod: 'none' });
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '200' });
  const pages = [];
  for (let i = 0; i < files.length; i++) {
    const t0 = Date.now();
    const { data } = await worker.recognize(path.join(dir, files[i]));
    const words = E.wordsFromOcr(data);
    const width = Math.max(...data.words.map((w) => w.bbox.x1)) + 50;
    pages.push({ page: i + 1, words, width, ocr: true });
    console.error(`page ${i + 1}: ${data.words.length} words, ${Date.now() - t0} ms`);
  }
  await worker.terminate();
  const doc = E.parse(pages, { fileName: name + '_scan.pdf' });
  console.log(`=== ${doc.fileName} | ${doc.docType} | bank=${doc.bank} | rows=${doc.rows.length} | status=${doc.status}`);
  console.log('summary', JSON.stringify(doc.summary));
  for (const c of doc.checks) console.log(`  [${c.level}] ${c.title} — ${c.detail}`);
  if (process.argv.includes('--rows')) for (const r of doc.rows) console.log(`   ${r.page} ${r.date ? `${r.date.d}/${r.date.m}` : '-'} | ${r.ref} | ${r.desc.slice(0, 45)} | D=${r.debit} K=${r.kredit} S=${r.saldo} ${r.status} ${JSON.stringify(r.sus)}`);
})();
