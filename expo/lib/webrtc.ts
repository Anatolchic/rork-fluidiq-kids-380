// WebRTC helpers — TURN credentials (use-auth-secret coturn), peer config.
// На web используется браузерный RTCPeerConnection. На native (iOS/Android) —
// react-native-webrtc (добавляется в EAS dev build, не в Expo Go).

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
