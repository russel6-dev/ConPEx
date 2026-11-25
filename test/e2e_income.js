// Uji fitur analisis uang masuk di extension: node test/e2e_income.js <outdir>
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const ext = path.resolve(__dirname, '../extension');
  const ctx = await chromium.launchPersistentContext(path.join(out, 'profile'), { headless: false, acceptDownloads: true, viewport: { width: 1380, height: 950 }, args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker'); const id = new URL(sw.url()).host;
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`chrome-extension://${id}/app.html`);
  await p.selectOption('#optInc', 'on');
  await p.setInputFiles('#fileInput', [path.join(__dirname, 'samples/campuran_q1_2025.pdf')]);
  await p.waitForFunction(() => { const s = window.__conpex.state; return s.items.length && !s.running && s.items.every((i) => i.status === 'done'); }, null, { timeout: 120000 });
  console.log('chips:', (await p.innerText('.chips')).replace(/\n+/g, ' | '));
  console.log('kolom uang masuk:', await p.locator('th', { hasText: 'Uang masuk' }).count(), '| select:', await p.locator('select.inc-sel').count());
  // ganti kategori transaksi KAS -> Bukan penghasilan, lalu jadikan aturan
  const row = p.locator('tr', { hasText: 'MCM InhouseTrf KAS' }).first();
  await row.locator('select.inc-sel').selectOption('non');
  await p.waitForTimeout(300);
  await p.locator('tr', { hasText: 'MCM InhouseTrf KAS' }).first().locator('[data-a="mkrule"]').click();
  await p.waitForTimeout(300);
  console.log('isi aturan:', await p.inputValue('#ruleText'), '/', await p.inputValue('#ruleCat'));
  await p.click('#ruleForm button[type=submit]'); await p.waitForTimeout(400);
  console.log('toast:', await p.textContent('#toast'));
  console.log('KAS sekarang:', await p.evaluate(() => window.__conpex.state.items[0].doc.rows.filter((r) => /KAS/.test(r.desc)).map((r) => r.inc.cat).join(',')));
  await p.click('[data-a="incfilter"][data-cat="cek"]'); await p.waitForTimeout(200);
  console.log('filter perlu dicek, baris tampil:', await p.locator('#tblWrap tbody tr[data-id]').count());
  await p.evaluate(() => document.querySelector('.inc-panel').scrollIntoView());
  await p.screenshot({ path: path.join(out, 'income.png') });
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#btnXlsx')]); const f1 = path.join(out, 'on.xlsx'); await d1.saveAs(f1);
  await p.selectOption('#optInc', 'off'); await p.waitForTimeout(300);
  console.log('setelah dimatikan, kolom uang masuk:', await p.locator('th', { hasText: 'Uang masuk' }).count());
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#btnXlsx')]); const f2 = path.join(out, 'off.xlsx'); await d2.saveAs(f2);
  console.log('errors:', errs); await ctx.close();
})();
