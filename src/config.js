// Public app settings. The Supabase anon key is a public client key; access is limited to realtime rooms.
window.ZK_CONFIG = {
  supabaseUrl: 'https://akrpiapogmejbywvqnal.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrcnBpYXBvZ21lamJ5d3ZxbmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NjU0MDAsImV4cCI6MjExMDI0MTQwMH0.u7NTMVr6nqNrC-Rxge2edPvwzka0wIxQ1Xe_8B8t2gk',
  linkBase: 'https://bassemt10.github.io/Playo/',
  xlsxUrl: 'xlsx.js',
  qrUrl: 'qrcode.js',
  // Plans: RevenueCat public SDK keys (one per store). Entitlements "plus" and "premium";
  // products plus_monthly, plus_yearly, premium_monthly, premium_yearly, pass_room20, pass_allcats, pass_editor
  rcKeys: { android: '__RC_ANDROID_KEY__', ios: '__RC_IOS_KEY__' },
  // Prices shown before the store prices load (the stores show real local prices)
  prices: { plus_monthly: '9.99$', plus_yearly: '69.99$', premium_monthly: '15.99$', premium_yearly: '109.99$', pass_room20: '1.99$', pass_allcats: '2.99$', pass_editor: '2.99$' },
  // Web version: one payment link per product (e.g. Stripe Payment Links)
  payLinks: { plus_monthly: '__PAY__', plus_yearly: '__PAY__', premium_monthly: '__PAY__', premium_yearly: '__PAY__', pass_room20: '__PAY__', pass_allcats: '__PAY__', pass_editor: '__PAY__' },
  // Google AdMob banner ids (app only), from your AdMob account
  admob: { android: { banner: '__ADMOB_ANDROID_BANNER__' }, ios: { banner: '__ADMOB_IOS_BANNER__' } },
  apkUrl: 'https://github.com/BassemT10/Playo/releases/latest/download/playo.apk'
};
