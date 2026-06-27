// WebRTC helpers — TURN credentials (use-auth-secret coturn), peer config.
// На web используется браузерный RTCPeerConnection. На native (iOS/Android) —
// react-native-webrtc (добавляется в EAS dev build, не в Expo Go).
//
// PRODUCTION TURN-server: 5.35.87.176 (Beget, отдельный VPS).
// - 3478/udp + 3478/tcp: РАБОТАЕТ (проверено turnutils_uclient 2026-06-07,
//   0% lost, 51ms RTT, jitter 0.65ms). Allocate/permission/refresh OK.
// - 5349/tcp (TURNS TLS): НЕ ОТКРЫТ. Это блокер для iOS Safari в production
//   (Apple требует TLS), и для пользователей за корпоративными NAT/FW
//   которые блокируют не-TLS трафик. TODO:
//   1. Получить SSH-доступ к 5.35.87.176 (сейчас в vault только TURN_SECRET)
//   2. На coturn включить cert-file=/etc/letsencrypt/live/turn.repetitory-app.ru/fullchain.pem
//      pkey-file=/etc/letsencrypt/live/turn.repetitory-app.ru/privkey.pem
//   3. tls-listening-port=5349, открыть в UFW
//   4. Cloudflare DNS turn.repetitory-app.ru → 5.35.87.176 A-запись (proxy=false)
//   5. certbot certonly --standalone -d turn.repetitory-app.ru

const TURN_HOST = process.env.EXPO_PUBLIC_TURN_HOST || '5.35.87.176';
const TURN_SECRET = process.env.EXPO_PUBLIC_TURN_SECRET || '';

async function hmacSha1Base64(key: string, message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && (crypto as any).subtle) {
    const enc = new TextEncoder();
    const cryptoKey = await (crypto as any).subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await (crypto as any).subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const bytes = new Uint8Array(sig);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  }
  return '';
}

export async function getTurnIceServers(userId: string): Promise<RTCIceServer[]> {
  if (!TURN_SECRET) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  const ttl = 3600;
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${userId}`;
  const password = await hmacSha1Base64(TURN_SECRET, username);
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        `turn:${TURN_HOST}:3478?transport=udp`,
        `turn:${TURN_HOST}:3478?transport=tcp`,
        `turns:${TURN_HOST}:5349?transport=tcp`,
      ],
      username,
      credential: password,
    },
  ];
}

export const PEER_CONFIG_DEFAULTS: RTCConfiguration = {
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 4,
};

/**
 * Диагностика TURN: пытается собрать relay-candidate за 5 секунд.
 * Возвращает {ok, ipFamily?, error?}. Используется как pre-flight перед call.
 */
export async function diagnoseTurn(userId: string): Promise<{ ok: boolean; relayFound?: boolean; relayAddr?: string; error?: string }> {
  try {
    const iceServers = await getTurnIceServers(userId);
    const pc = new (global as any).RTCPeerConnection({ ...PEER_CONFIG_DEFAULTS, iceServers });
    pc.createDataChannel('probe');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return await new Promise((resolve) => {
      let relayFound = false;
      let relayAddr = '';
      const timer = setTimeout(() => {
        try { pc.close(); } catch {}
        resolve({ ok: relayFound, relayFound, relayAddr });
      }, 5000);
      pc.onicecandidate = (e: any) => {
        const c = e.candidate;
        if (!c) return;
        if (c.candidate && c.candidate.includes(' typ relay ')) {
          relayFound = true;
          const m = c.candidate.match(/raddr (\S+)/);
          if (m) relayAddr = m[1];
          clearTimeout(timer);
          try { pc.close(); } catch {}
          resolve({ ok: true, relayFound: true, relayAddr });
        }
      };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Адаптивный битрейт — после установки соединения вызываем applyBitrate на отправляющих видео-tracks
export async function applyBitrateLimit(pc: RTCPeerConnection, maxKbps: number) {
  const senders = pc.getSenders ? pc.getSenders() : [];
  for (const s of senders) {
    if (s.track?.kind !== 'video') continue;
    try {
      const params = s.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      for (const enc of params.encodings) {
        enc.maxBitrate = maxKbps * 1000;
      }
      await s.setParameters(params);
    } catch {}
  }
}
