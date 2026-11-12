const { chromium } = require('playwright');
(async () => {
  const [inp, out, w, h] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.goto('file://' + inp); await p.waitForTimeout(300);
  await p.screenshot({ path: out });
  await b.close();
})();
