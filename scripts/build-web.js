// Builds www/ (used by the Android/iPhone apps and by the public web version) from src/game.html.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), www = path.join(root, 'www');
const nm = p => path.join(root, 'node_modules', p);
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(path.join(www, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(www, 'icons'), { recursive: true });

// fonts bundled so the app looks right offline
const faces = [];
const fontSets = [['Tajawal', '@fontsource/tajawal/files', 'tajawal', [400, 500, 700]],
                  ['Baloo Bhaijaan 2', '@fontsource/baloo-bhaijaan-2/files', 'baloo-bhaijaan-2', [500, 700, 800]]];
for (const [fam, dir, slug, weights] of fontSets) for (const w of weights) for (const sub of ['arabic', 'latin']) {
  const f = `${slug}-${sub}-${w}-normal.woff2`;
  fs.copyFileSync(nm(`${dir}/${f}`), path.join(www, 'fonts', f));
  const range = sub === 'arabic' ? 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC'
                                 : 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  faces.push(`@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${f}) format('woff2');unicode-range:${range}}`);
}
fs.writeFileSync(path.join(www, 'fonts.css'), faces.join('\n'));

let game = fs.readFileSync(path.join(root, 'src', 'game.html'), 'utf8');
game = game.replace(/<link rel="preconnect"[^>]*>\s*/g, '')
           .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts.css">');

const head = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#0E1626"><meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="ذاكِرة">
<meta name="description" content="ألعاب ذاكرة وتركيز تلعبها وحدك أو مع أصدقائك مباشرة">
<link rel="manifest" href="manifest.webmanifest"><link rel="icon" type="image/png" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/icon-180.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;-webkit-user-select:none;user-select:none;overscroll-behavior:none}input{-webkit-user-select:text;user-select:text}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="config.js"></script><script src="supabase.js"></script><script src="net.js"></script>
</head><body>`;
fs.writeFileSync(path.join(www, 'index.html'), head + game + '</body></html>');
fs.copyFileSync(path.join(root, 'src', 'config.js'), path.join(www, 'config.js'));
fs.copyFileSync(path.join(root, 'src', 'net-supabase.js'), path.join(www, 'net.js'));
fs.copyFileSync(nm('@supabase/supabase-js/dist/umd/supabase.js'), path.join(www, 'supabase.js'));
for (const f of fs.readdirSync(path.join(root, 'assets', 'web'))) fs.copyFileSync(path.join(root, 'assets', 'web', f), path.join(www, 'icons', f));
fs.writeFileSync(path.join(www, 'manifest.webmanifest'), JSON.stringify({
  name: 'ذاكِرة – ألعاب الذاكرة', short_name: 'ذاكِرة', lang: 'ar', dir: 'rtl', start_url: './', scope: './',
  display: 'standalone', orientation: 'portrait', background_color: '#0E1626', theme_color: '#0E1626',
  icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
}, null, 1));
fs.writeFileSync(path.join(www, '.nojekyll'), '');
console.log('www built');
