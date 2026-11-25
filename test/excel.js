// Buat Excel dari PDF contoh: NODE_PATH=... node test/excel.js out.xlsx file1.pdf [file2.pdf ...]
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const E = require('../extension/engine.js');
const X = require('../extension/excel.js');
const I = require('../extension/income.js');
async function pagesFromPdf(file) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const vp = page.getViewport({ scale: 1 }); const tc = await page.getTextContent();
    const items = tc.items.map((it) => { const tx = pdfjsLib.Util.transform(vp.transform, it.transform); return { str: it.str, x: tx[4], y: tx[5], w: it.width, h: Math.hypot(tx[2], tx[3]) }; });
    pages.push({ page: p, words: E.wordsFromTextItems(items), width: vp.width, height: vp.height, ocr: false });
  }
  return pages;
}
(async () => {
  const [out, ...files] = process.argv.slice(2);
  const docs = [];
  for (const f of files) docs.push(E.parse(await pagesFromPdf(f), { fileName: path.basename(f) }));
  for (const d of docs) if (d.docType === 'bank') I.analyze(d);
  const buf = await X.build(docs, E.checkContinuity(docs));
  fs.writeFileSync(out, Buffer.from(buf));
  console.log('wrote', out, buf.byteLength);
})();
