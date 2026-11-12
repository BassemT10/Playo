// Public app settings. The Supabase anon key is a public client key; access is limited to realtime rooms.
window.ZK_CONFIG = {
  supabaseUrl: '__SUPABASE_URL__',
  supabaseKey: '__SUPABASE_ANON_KEY__',
  linkBase: 'https://bassemt10.github.io/playo-app/',
  xlsxUrl: 'xlsx.js',
  qrUrl: 'qrcode.js',
  // Subscriptions (RevenueCat public SDK keys, one per store) and the entitlement that unlocks Premium
  rcKeys: { android: '__RC_ANDROID_KEY__', ios: '__RC_IOS_KEY__' },
  entitlement: 'premium',
  // Prices shown before the store prices load (the stores show real local prices)
  prices: { monthly: '2.99$', yearly: '19.99$' },
  // Web version: payment links (e.g. Stripe Payment Links) for monthly / yearly
  payLinks: { monthly: '__PAY_LINK_MONTHLY__', yearly: '__PAY_LINK_YEARLY__' },
  apkUrl: 'https://github.com/BassemT10/playo-app/releases/latest/download/playo.apk'
};
