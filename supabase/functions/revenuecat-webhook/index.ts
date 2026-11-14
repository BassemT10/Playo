// Playo: RevenueCat webhook -> plan (tier), subscription end, 24-hour passes, and the payments log for the admin dashboard.
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secrets: supabase secrets set REVENUECAT_WEBHOOK_AUTH=<long random text>
// In RevenueCat > Integrations > Webhooks: URL = https://<project>.supabase.co/functions/v1/revenuecat-webhook,
// Authorization header = the same random text. The app logs players into RevenueCat with their Supabase user id.
// Products: plus_monthly, plus_yearly, premium_monthly, premium_yearly (entitlements "plus" / "premium");
//           pass_room20, pass_allcats, pass_editor (consumables, 24 hours each).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SUB = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"]);
const PAID = new Set(["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE", "PRODUCT_CHANGE"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const passOf = (p: string) => (p.match(/pass_(room20|allcats|editor)/) || [])[1] || null;
const tierOf = (e: any) => {
  const ent: string[] = e.entitlement_ids ?? (e.entitlement_id ? [e.entitlement_id] : []);
  if (ent.includes("premium") || /premium/i.test(e.product_id ?? "")) return "premium";
  if (ent.includes("plus") || /plus/i.test(e.product_id ?? "")) return "plus";
  return "premium";
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (req.headers.get("authorization") !== Deno.env.get("REVENUECAT_WEBHOOK_AUTH")) return new Response("unauthorized", { status: 401 });
  const { event } = await req.json().catch(() => ({ event: null }));
  if (!event) return new Response("bad request", { status: 400 });

  const ids: string[] = [...new Set([event.app_user_id, ...(event.aliases ?? []), ...(event.transferred_to ?? [])].filter((x) => typeof x === "string" && UUID.test(x)))];
  if (!ids.length) return new Response("ignored: anonymous user", { status: 200 });
  const product: string = event.product_id ?? "";
  const pass = passOf(product);

  if (pass && event.type === "NON_RENEWING_PURCHASE") {
    const until = new Date((event.purchased_at_ms ?? Date.now()) + 24 * 3600e3).toISOString();
    const { data } = await db.from("profiles").select("id,passes").in("id", ids);
    for (const p of data ?? []) await db.from("profiles").update({ passes: { ...(p.passes ?? {}), [pass]: until } }).eq("id", p.id);
  } else if (SUB.has(event.type)) {
    const { error } = await db.from("profiles").update({
      premium_until: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
      premium_plan: product || null, tier: tierOf(event),
    }).in("id", ids);
    if (error) return new Response(error.message, { status: 500 });
  } else if (event.type === "EXPIRATION") {
    await db.from("profiles").update({ premium_until: null, premium_plan: null, tier: null }).in("id", ids);
  } // CANCELLATION / BILLING_ISSUE: keep access until the paid period ends

  if (PAID.has(event.type) && (event.price ?? 0) > 0) {
    await db.from("payments").upsert({
      user_id: ids[0], product, tier: pass ? null : tierOf(event), kind: pass ? "pass" : event.type === "RENEWAL" ? "renewal" : "sub",
      amount: event.price, currency: "USD", store: event.store ?? null, event_id: event.id ?? null,
      created_at: new Date(event.event_timestamp_ms ?? Date.now()).toISOString(),
    }, { onConflict: "event_id", ignoreDuplicates: true });
  }
  return new Response("ok", { status: 200 });
});
