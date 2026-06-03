// Supabase Edge Function: notify-web-push
// Deploy: supabase functions deploy notify-web-push
//
// Отправляет Web Push на все активные подписки пользователя (platform='web').
// Native Expo Push идёт отдельной функцией / прямым вызовом Expo API.
//
// Тело запроса (POST JSON):
//   {
//     "user_id": "<uuid>",
//     "title":   "Новая бронь",
//     "body":    "Иван забронировал занятие на 18:00",
//     "data":    { ... произвольный JSON },   // опционально
//     "url":     "/booking/123"                // опционально, кладётся в data.url
//   }
//
// VAPID env (выставляются через `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY  — base64url public key
//   VAPID_PRIVATE_KEY — base64url private key
//   VAPID_EMAIL       — контакт mailto: для VAPID JWT subject

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") ?? "admin@repetitory-app.ru";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_EMAIL.startsWith("mailto:") ? VAPID_EMAIL : `mailto:${VAPID_EMAIL}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

interface NotifyRequest {
  user_id: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID keys not configured" }, 500);
  }

  let payload: NotifyRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { user_id, title, body, data, url } = payload || ({} as NotifyRequest);
  if (!user_id || !title) {
    return json({ error: "user_id и title обязательны" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: tokens, error: tErr } = await admin
    .from("push_tokens")
    .select("token, user_id")
    .eq("user_id", user_id)
    .eq("platform", "web");

  if (tErr) {
    console.error("[notify-web-push] tokens query error", tErr);
    return json({ error: "DB error" }, 500);
  }

  const rows = tokens || [];
  if (rows.length === 0) {
    return json({ sent: 0, removed: 0, total: 0, reason: "no_web_tokens" });
  }

  const notifPayload = JSON.stringify({
    title,
    body: body ?? "",
    data: { ...(data ?? {}), url: url ?? (data as any)?.url ?? "/" },
    url: url ?? "/",
  });

  let sent = 0;
  let removed = 0;
  const errors: { token: string; status?: number; message?: string }[] = [];

  await Promise.all(
    rows.map(async (row: any) => {
      let subscription: any = null;
      try {
        subscription = typeof row.token === "string" ? JSON.parse(row.token) : row.token;
      } catch {
        // Битый токен — выкидываем.
        await admin.from("push_tokens").delete().eq("token", row.token).eq("platform", "web");
        removed++;
        return;
      }

      try {
        await webpush.sendNotification(subscription, notifPayload);
        sent++;
      } catch (e: any) {
        const status = e?.statusCode;
        // 404/410 = подписка протухла, чистим. Остальное — логируем, не удаляем.
        if (status === 404 || status === 410) {
          await admin
            .from("push_tokens")
            .delete()
            .eq("token", row.token)
            .eq("platform", "web");
          removed++;
        } else {
          console.error("[notify-web-push] send error", status, e?.body || e?.message);
          errors.push({ token: row.token.slice(0, 32) + "…", status, message: e?.message });
        }
      }
    }),
  );

  return json({ sent, removed, total: rows.length, errors: errors.length ? errors : undefined });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
