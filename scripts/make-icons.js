// Renders app icons and splash screens from the logo (run once; output is committed).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const LOGO = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${s}" height="${s}"><rect x="3" y="3" width="19" height="19" rx="6" fill="#4FD1C5"/><rect x="26" y="3" width="19" height="19" rx="6" fill="#1F2E4D" stroke="#2A3B5E" stroke-width="2"/><rect x="3" y="26" width="19" height="19" rx="6" fill="#1F2E4D" stroke="#2A3B5E" stroke-width="2"/><rect x="26" y="26" width="19" height="19" rx="6" fill="#FFB547"/><path d="M35.5 30.5l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#2B1900"/><circle cx="12.5" cy="12.5" r="4" fill="#0E1626"/></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  async function render(file, size, { logo = 0.62, bg = '#0E1626', radius = 0, transparent = false } = {}) {
    await p.setViewportSize({ width: size, height: size });
    const ls = Math.round(size * logo);
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${transparent ? 'transparent' : bg};border-radius:${radius * size}px;overflow:hidden">${LOGO(ls)}</div></body></html>`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: transparent || radius > 0 });
  }
  await render('assets/icon-1024.png', 1024);
  for (const s of [180, 192, 512]) await render(`assets/web/icon-${s}.png`, s);
  await render('assets/web/icon-maskable-512.png', 512, { logo: 0.5 });
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    await render(`assets/android/mipmap-${d}/ic_launcher.png`, Math.round(48 * k), { radius: 0.18 });
    await render(`assets/android/mipmap-${d}/ic_launcher_round.png`, Math.round(48 * k), { radius: 0.5, logo: 0.56 });
    await render(`assets/android/mipmap-${d}/ic_launcher_foreground.png`, Math.round(108 * k), { logo: 0.42, transparent: true });
  }
  // splash: logo centred on brand background
  for (const s of [2732]) { await p.setViewportSize({ width: 1366, height: 1366 });
    await p.setContent(`<html><body style="margin:0"><div style="width:1366px;height:1366px;display:grid;place-items:center;background:#0E1626">${LOGO(260)}</div></body></html>`);
    await p.screenshot({ path: 'assets/splash-2732.png', scale: 'device' }); }
  await b.close(); console.log('icons done');
})();
