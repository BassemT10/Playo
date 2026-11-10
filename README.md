# ذاكِرة — Zakira Memory Games

تطبيق ألعاب ذاكرة وتركيز يعمل على **أندرويد** و**آيفون** وفي **المتصفح**، مع لعب مباشر بين الأصدقاء.

| النسخة | من أين |
|---|---|
| أندرويد | [تحميل zakira.apk](https://github.com/BassemT10/zakira-app/releases/latest/download/zakira.apk) |
| آيفون | TestFlight (بعد تفعيل حساب Apple Developer) |
| المتصفح | https://bassemt10.github.io/zakira-app/ |

## كيف يُبنى
كل تعديل على فرع `main` يبني تلقائياً على GitHub Actions:
- **Android app** ← ملف APK موقّع في صفحة Releases.
- **iPhone app** ← فحص بناء؛ ومع إعدادات Apple يرفع إلى TestFlight.
- **Web version** ← ينشر نسخة المتصفح على GitHub Pages.

## البنية
```
src/game.html          اللعبة كاملة (نفس الكود في التطبيق والمتصفح وصفحة Claude)
src/net-supabase.js    الغرف المباشرة عبر Supabase Realtime
src/config.js          رابط Supabase والمفتاح العام وروابط التحميل
scripts/build-web.js   يبني مجلد www/
android/  ios/         مشروعا Capacitor للهاتف
```
اللعب المباشر: كل جهاز يشغّل نفس محرك اللعبة بنفس البذرة العشوائية، ويُرسل فقط اختيارات كل لاعب عبر Supabase Presence، فتبقى كل الشاشات متطابقة.

## تفعيل آيفون (TestFlight)
1. فعّل Apple Developer Program.
2. في App Store Connect أنشئ تطبيقاً جديداً بالمعرّف `app.zakira.memory`.
3. أنشئ مفتاح API من App Store Connect ← Users and Access ← Integrations (دور App Manager).
4. أضف في GitHub ← Settings ← Secrets and variables ← Actions:
   `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (محتوى ملف .p8 كاملاً).
5. شغّل workflow **iPhone app** من تبويب Actions.

## ملاحظات
- APK الحالي موقّع بمفتاح اختبار موجود في المستودع، مناسب للتجربة مع الأصدقاء. قبل Google Play نُنشئ مفتاحاً خاصاً سرياً.
- مكان إعلان البانر محجوز؛ AdMob يُضاف في مرحلة النشر.
