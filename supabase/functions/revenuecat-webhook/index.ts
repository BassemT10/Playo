// Playo: RevenueCat webhook -> profiles.premium_until
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secrets: supabase secrets set REVENUECAT_WEBHOOK_AUTH=<long random text>
// In RevenueCat > Integrations > Webhooks: URL = https://<project>.supabase.co/functions/v1/revenuecat-webhook,
// Authorization header = the same random text. The app logs players into RevenueCat with their Supabase user id.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ACTIVE = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (req.headers.get("authorization") !== Deno.env.get("REVENUECAT_WEBHOOK_AUTH")) return new Response("unauthorized", { status: 401 });
  const { event } = await req.json().catch(() => ({ event: null }));
  if (!event) return new Response("bad request", { status: 400 });

  const ids: string[] = [event.app_user_id, ...(event.aliases ?? []), ...(event.transferred_to ?? [])].filter((x) => typeof x === "string" && UUID.test(x));
  if (!ids.length) return new Response("ignored: anonymous user", { status: 200 });

  let patch: Record<string, unknown> | null = null;
  if (ACTIVE.has(event.type)) {
    patch = { premium_until: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null, premium_plan: event.product_id ?? null };
  } else if (event.type === "EXPIRATION") {
    patch = { premium_until: null, premium_plan: null };
  } // CANCELLATION / BILLING_ISSUE: keep access until the paid period ends

  if (patch) {
    const { error } = await db.from("profiles").update(patch).in("id", [...new Set(ids)]);
    if (error) return new Response(error.message, { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
