// Uji UI: password, lompat ke baris bermasalah, edit sel, tab buku besar, layar sempit.
// node test/e2e_ui.js <outdir>
const { chromium } = require('playwright'); const path=require('path');
(async()=>{const out=process.argv[2]; const ext=path.resolve(__dirname,'../extension');
const ctx=await chromium.launchPersistentContext(out+'/profile2',{headless:false,viewport:{width:1360,height:900},args:['--headless=new',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-sandbox']});
const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const id=new URL(sw.url()).host;
const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await page.goto(`chrome-extension://${id}/app.html`);
const S=path.join(__dirname,'samples')+'/';
await page.setInputFiles('#fileInput',[S+'bca_salah_cetak.pdf',S+'bri_berpassword.pdf',S+'buku_besar_okt2025_scan.pdf']);
const idle=()=>page.waitForFunction(()=>{const s=window.__conpex.state;return s.items.length&&!s.running&&s.items.every(i=>['done','error','password'].includes(i.status))},null,{timeout:300000,polling:300});
await idle();
console.log(await page.evaluate(()=>window.__conpex.state.items.map(i=>i.name+': '+i.status+' '+i.msg).join('\n')));
await page.fill('input[type=password]','salah'); await page.click('.pw button'); await page.waitForTimeout(300); await idle();
console.log('after wrong:', await page.evaluate(()=>window.__conpex.state.items[1].msg));
await page.fill('input[type=password]','01011990'); await page.click('.pw button'); await page.waitForTimeout(300); await idle();
console.log('after right:', await page.evaluate(()=>{const i=window.__conpex.state.items[1];return i.status+' '+i.msg+' '+i.doc.status}));
await page.screenshot({path:out+'/files.png'});
// klik cek error di BCA -> lompat ke baris
await page.click('.check.error.link'); await page.waitForTimeout(900);
await page.screenshot({path:out+'/jump.png'});
// edit saldo baris merah pertama -> perbaiki
const fix = await page.evaluate(()=>{const d=window.__conpex.state.items[0].doc;const r=d.rows.find(x=>x.status==='err');return {id:r.id, calc:r.calc}});
const td = page.locator(`tr[data-id="${fix.id}"] td[data-f="saldo"]`);
await td.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(String(fix.calc).replace('.',',')); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
console.log('after edit:', await page.evaluate(()=>window.__conpex.state.items[0].doc.checks.map(c=>c.level+':'+c.title).join(' | ')));
// tab buku besar
await page.click('.tab:nth-child(3)'); await page.waitForTimeout(300);
await page.evaluate(()=>document.querySelector('#tblWrap').scrollIntoView());
await page.screenshot({path:out+'/gl.png'});
// mobile-ish width
await page.setViewportSize({width:420,height:900}); await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(200);
await page.screenshot({path:out+'/narrow.png'});
console.log('hscroll:', await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth));
console.log('errors', errs); await ctx.close();})();
