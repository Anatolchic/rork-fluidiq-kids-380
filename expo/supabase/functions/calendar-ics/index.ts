// Supabase Edge Function: calendar-ics
// Deploy: supabase functions deploy calendar-ics --no-verify-jwt
//
// Возвращает iCalendar (.ics) фид с бронированиями текущего пользователя.
// Используется для подписки в Google Calendar / Apple Calendar.
//
// URL: https://supabase.repetitory-app.ru/functions/v1/calendar-ics?token=<user_jwt>
// Метод: GET
// Авторизация: JWT передаётся в query (?token=...), а не в Authorization header,
// потому что внешние клиенты (Google/Apple) не умеют присылать кастомные заголовки
// при подписке на календарь по URL.
//
// Безопасность: JWT валидируется через supabase.auth.getUser(token). Если токен
// не подписан правильным секретом или истёк — getUser вернёт error, отдаём 401.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ICS_HEADERS = {
  ...corsHeaders,
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "no-cache, no-store, must-revalidate",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BOOKING_BASE_URL = "https://web.repetitory-app.ru/booking/";

/** Форматирует ISO дату в формат iCalendar UTC: 20260602T180000Z */
function icsDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** Экранирует спецсимволы в текстовых полях iCalendar (RFC 5545 §3.3.11). */
function icsEscape(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Сворачивает длинные строки по 75 октетов (RFC 5545 §3.1) — некоторые клиенты строгие. */
function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74));
    parts.push((i === 0 ? "" : " ") + chunk);
    i += i === 0 ? 75 : 74;
  }
  return parts.join("\r\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token", { status: 401, headers: corsHeaders });
    }

    // Валидируем JWT через anon-клиент (он умеет проверять подпись supabase auth).
    const authClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response("Invalid token", { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    // Для запроса самих броней используем service role — RLS не должна нам мешать,
    // мы уже проверили принадлежность через JWT и фильтруем by user_id вручную.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: bookings, error: bErr } = await admin
      .from("bookings")
      .select("id, student_id, tutor_id, subject, topic, start_time, end_time, status, price")
      .in("status", ["confirmed", "active", "pending"])
      .or(`student_id.eq.${userId},tutor_id.eq.${userId}`)
      .order("start_time", { ascending: true });

    if (bErr) {
      console.error("[calendar-ics] bookings error", bErr);
      return new Response("DB error", { status: 500, headers: corsHeaders });
    }

    const rows = bookings || [];

    // Собираем имена контрагентов из tutor_profiles / student_profiles.
    const tutorIds = [...new Set(rows.map((b: any) => b.tutor_id))];
    const studentIds = [...new Set(rows.map((b: any) => b.student_id))];
    const [tRes, sRes] = await Promise.all([
      tutorIds.length
        ? admin.from("tutor_profiles").select("user_id, name").in("user_id", tutorIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
      studentIds.length
        ? admin.from("student_profiles").select("user_id, name").in("user_id", studentIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
    ]);
    const tutorNames: Record<string, string> = {};
    (tRes.data || []).forEach((p: any) => (tutorNames[p.user_id] = p.name));
    const studentNames: Record<string, string> = {};
    (sRes.data || []).forEach((p: any) => (studentNames[p.user_id] = p.name));

    const nowStamp = icsDate(new Date().toISOString());
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Repetitory//Bookings Calendar//RU",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Репетитори · Уроки",
      "X-WR-TIMEZONE:Europe/Moscow",
    ];

    for (const b of rows as any[]) {
      const isTutor = b.tutor_id === userId;
      const counterpartName = isTutor
        ? studentNames[b.student_id] || "ученик"
        : tutorNames[b.tutor_id] || "репетитор";

      const summary =
        icsEscape(b.subject) + (b.topic ? " \\u00b7 " + icsEscape(b.topic) : "");
      const description =
        "Урок с " +
        icsEscape(counterpartName) +
        " · " +
        (Number(b.price || 0) / 100).toLocaleString("ru") +
        " ₽";

      lines.push("BEGIN:VEVENT");
      lines.push(icsFold(`UID:${b.id}@repetitory-app.ru`));
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART:${icsDate(b.start_time)}`);
      lines.push(`DTEND:${icsDate(b.end_time)}`);
      lines.push(icsFold(`SUMMARY:${summary}`));
      lines.push(icsFold(`DESCRIPTION:${icsEscape(description)}`));
      lines.push(icsFold(`URL:${BOOKING_BASE_URL}${b.id}`));
      lines.push(`STATUS:${b.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    const body = lines.join("\r\n") + "\r\n";

    return new Response(body, { status: 200, headers: ICS_HEADERS });
  } catch (e) {
    console.error("[calendar-ics] unexpected", e);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
});
