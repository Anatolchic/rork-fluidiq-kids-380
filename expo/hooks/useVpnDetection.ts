import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

type VpnInfo = {
  detected: boolean;
  reason?: string;
};

// Слова которые сильно говорят за VPN/proxy в названии ISP/Organization.
// Сознательно не включаем общие "cloud", "amazon", "google", "microsoft" и
// крупные хостинги — они дают false positive у пользователей которые
// просто сидят за корпоративным или мобильным NAT, не используя VPN.
// Оставляем явные VPN-провайдеры + Tor + классические hosting-маркеры.
const VPN_KEYWORDS = [
  "vpn",
  "proxy",
  "tor exit",
  "tor node",
  "nordvpn",
  "expressvpn",
  "surfshark",
  "protonvpn",
  "mullvad",
  "cyberghost",
  "private internet access",
  "windscribe",
  "atlas vpn",
  "ipvanish",
  "hide.me",
  "purevpn",
  "hidemyass",
  "tunnelbear",
  "amneziavpn",
  "outline",
];

type Probe = {
  detected: boolean;
  reason?: string;
};

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    console.log("[vpn] fetch failed", url, (e as Error)?.message);
    return null;
  }
}

function matchKeyword(blob: string): string | null {
  const lower = blob.toLowerCase();
  return VPN_KEYWORDS.find((k) => lower.includes(k)) ?? null;
}

async function probeIpwhois(): Promise<Probe> {
  type R = {
    success?: boolean;
    connection?: { org?: string; isp?: string; domain?: string };
  };
  const data = await fetchJson<R>("https://ipwho.is/?fields=success,connection", 5000);
  if (!data?.success) return { detected: false };
  const blob = `${data.connection?.org ?? ""} ${data.connection?.isp ?? ""} ${data.connection?.domain ?? ""}`;
  const hit = matchKeyword(blob);
  return hit ? { detected: true, reason: hit } : { detected: false };
}

async function probeIpapi(): Promise<Probe> {
  type R = {
    org?: string;
    asn?: string;
    asn_org?: string;
    company?: { name?: string; type?: string };
  };
  const data = await fetchJson<R>("https://ipapi.co/json/", 5000);
  if (!data) return { detected: false };
  const blob = `${data.org ?? ""} ${data.asn ?? ""} ${data.asn_org ?? ""} ${data.company?.name ?? ""} ${data.company?.type ?? ""}`;
  const hit = matchKeyword(blob);
  return hit ? { detected: true, reason: hit } : { detected: false };
}

async function probeIpapiIs(): Promise<Probe> {
  // ipapi.is — бесплатный без ключа, HTTPS (работает под iOS ATS),
  // отдаёт явные булевы флаги is_vpn / is_proxy / is_tor / is_datacenter.
  // Это основной надёжный сигнал в нативной сборке.
  type R = {
    is_vpn?: boolean;
    is_proxy?: boolean;
    is_tor?: boolean;
    is_datacenter?: boolean;
    is_abuser?: boolean;
    company?: { name?: string; type?: string };
    asn?: { org?: string; descr?: string };
  };
  const data = await fetchJson<R>("https://api.ipapi.is/", 5000);
  if (!data) return { detected: false };
  if (data.is_vpn) return { detected: true, reason: "vpn" };
  if (data.is_proxy) return { detected: true, reason: "proxy" };
  if (data.is_tor) return { detected: true, reason: "tor" };
  if (data.is_datacenter || data.company?.type === "hosting") {
    return { detected: true, reason: "hosting" };
  }
  const blob = `${data.company?.name ?? ""} ${data.asn?.org ?? ""} ${data.asn?.descr ?? ""}`;
  const hit = matchKeyword(blob);
  return hit ? { detected: true, reason: hit } : { detected: false };
}

async function probeIpinfo(): Promise<Probe> {
  type R = { org?: string; privacy?: { vpn?: boolean; proxy?: boolean; tor?: boolean; hosting?: boolean } };
  const data = await fetchJson<R>("https://ipinfo.io/json", 5000);
  if (!data) return { detected: false };
  if (data.privacy?.vpn) return { detected: true, reason: "vpn" };
  if (data.privacy?.proxy) return { detected: true, reason: "proxy" };
  if (data.privacy?.tor) return { detected: true, reason: "tor" };
  const blob = data.org ?? "";
  const hit = matchKeyword(blob);
  return hit ? { detected: true, reason: hit } : { detected: false };
}

async function probeCloudflare(): Promise<Probe> {
  // Cloudflare trace returns a small text block. If `warp=on` or `gateway=on`
  // it strongly indicates VPN/proxy use. Doesn't require parsing JSON.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { detected: false };
    const txt = await res.text();
    if (/\bwarp=on\b/i.test(txt)) return { detected: true, reason: "warp" };
    if (/\bgateway=on\b/i.test(txt)) return { detected: true, reason: "gateway" };
    return { detected: false };
  } catch (e) {
    console.log("[vpn] cloudflare trace failed", (e as Error)?.message);
    return { detected: false };
  }
}

/**
 * Lightweight VPN/Proxy heuristic. Calls a few public endpoints in parallel
 * (best-effort) and reports detection if any of them flags VPN/proxy use.
 *
 * Never throws and silently disables if all probes fail (e.g. offline).
 */
export function useVpnDetection(): VpnInfo {
  const [info, setInfo] = useState<VpnInfo>({ detected: false });
  const inFlightRef = useRef<boolean>(false);
  const lastRunRef = useRef<number>(0);

  const run = useCallback(async () => {
    // Защита от двойных запусков при быстрых переключениях background↔active.
    if (inFlightRef.current) return;
    const now = Date.now();
    if (now - lastRunRef.current < 5000) return;
    inFlightRef.current = true;
    lastRunRef.current = now;
    try {
      const probes = await Promise.allSettled([
        probeIpwhois(),
        probeIpapi(),
        probeIpapiIs(),
        probeIpinfo(),
        probeCloudflare(),
      ]);
      let nextDetected = false;
      let nextReason: string | undefined;
      for (const p of probes) {
        if (p.status === "fulfilled" && p.value.detected) {
          nextDetected = true;
          nextReason = p.value.reason;
          break;
        }
      }
      if (nextDetected) {
        console.log("[vpn] detected", nextReason, { platform: Platform.OS });
        setInfo({ detected: true, reason: nextReason });
      } else {
        console.log("[vpn] no VPN signal", { platform: Platform.OS });
        setInfo({ detected: false });
      }
    } catch (e) {
      console.log("[vpn] detection skipped", (e as Error)?.message);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    run();
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        console.log("[vpn] app became active — re-running detection");
        run();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      sub.remove();
    };
  }, [run]);

  return info;
}
