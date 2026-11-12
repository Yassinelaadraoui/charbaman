// usage: node render.js in.svg out.png width height
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [inp, out, w, h] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const svg = fs.readFileSync(inp, 'utf8').replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"`);
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: +w, height: +h } });
  await b.close();
})();
