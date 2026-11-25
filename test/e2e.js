// Uji end-to-end: muat extension di Chromium, unggah PDF, tunggu hasil, unduh Excel, ambil screenshot.
// node test/e2e.js <outdir> file1.pdf [file2.pdf ...]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [outDir, ...files] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const ext = path.resolve(__dirname, '../extension');
  const ctx = await chromium.launchPersistentContext(path.join(outDir, 'profile'), {
    headless: false, acceptDownloads: true, viewport: { width: 1360, height: 1000 },
    args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`chrome-extension://${id}/app.html`);
  await page.setInputFiles('#fileInput', files.map((f) => path.resolve(f)));
  const t0 = Date.now();
  await page.waitForFunction((n) => { const s = window.__conpex.state; return s.items.length === n && s.items.every((i) => ['done', 'error', 'password'].includes(i.status)) && !s.running; }, files.length, { timeout: 600000, polling: 500 });
  console.log('processed in', Date.now() - t0, 'ms');
  const info = await page.evaluate(() => window.__conpex.state.items.map((i) => ({ name: i.name, status: i.status, msg: i.msg, doc: i.doc && { status: i.doc.status, rows: i.doc.rows.length, checks: i.doc.checks.map((c) => `[${c.level}] ${c.title}`) } })));
  console.log(JSON.stringify(info, null, 1));
  console.log('banner:', await page.textContent('#banner .banner-title'));
  await page.screenshot({ path: path.join(outDir, 'app.png'), fullPage: false });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnXlsx')]);
  const xp = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(xp);
  console.log('excel:', xp, fs.statSync(xp).size);
  console.log('errors:', errors);
  await ctx.close();
})();
