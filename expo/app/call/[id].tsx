import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Mic, MicOff, Video as VideoOn, VideoOff, PhoneOff, RefreshCw } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { getTurnIceServers, PEER_CONFIG_DEFAULTS, applyBitrateLimit } from '../../lib/webrtc';

const CONNECTION_TIMEOUT_MS = 20000;
const RECONNECT_AFTER_MS = 3000;

type SignalType = 'offer' | 'answer' | 'ice' | 'bye';

export default function CallScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();

  const [status, setStatus] = useState<'preparing' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'ended'>('preparing');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteOnline, setRemoteOnline] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const initiatedRef = useRef(false);
  const peerOnlineRef = useRef(false);
  const timerRef = useRef<any>(null);
  const reconnectAttemptRef = useRef(0);

  // Если не web — показываем заглушку. react-native-webrtc подключим в EAS dev build.
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.unsupportedEmoji}>📹</Text>
        <Text style={styles.unsupportedTitle}>Видеоурок доступен в веб-версии</Text>
        <Text style={styles.unsupportedSub}>Откройте web.repetitory-app.ru на ноутбуке или телефоне в браузере. Поддержка нативного iOS/Android появится в следующей версии.</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeText}>Закрыть</Text>
        </TouchableOpacity>
      </View>
    );
  }

  useEffect(() => {
    if (!bookingId || !session) return;
    setup();
    return () => { teardown('unmount'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  function attachLocalStream(stream: MediaStream) {
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      (localVideoRef.current as any).srcObject = stream;
      localVideoRef.current.play?.().catch(() => {});
    }
  }
  function attachRemoteStream(stream: MediaStream) {
    remoteStreamRef.current = stream;
    if (remoteVideoRef.current) {
      (remoteVideoRef.current as any).srcObject = stream;
      remoteVideoRef.current.play?.().catch(() => {});
    }
  }

  async function setup() {
    try {
      // 1) media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      attachLocalStream(stream);

      // 2) peer connection
      const iceServers = await getTurnIceServers(session!.user.id);
      const pc = new RTCPeerConnection({ ...PEER_CONFIG_DEFAULTS, iceServers });
      pcRef.current = pc;

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = (e: RTCTrackEvent) => {
        const [remote] = e.streams;
        if (remote) attachRemoteStream(remote);
      };
      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate) sendSignal('ice', { candidate: e.candidate.toJSON() });
      };
      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') {
          setStatus('connected');
          reconnectAttemptRef.current = 0;
          applyBitrateLimit(pc, 1500).catch(() => {});
        } else if (s === 'disconnected') {
          setStatus('connecting');
          setTimeout(() => {
            if (pcRef.current && pcRef.current.iceConnectionState === 'disconnected') {
              reconnectAttemptRef.current += 1;
              if (reconnectAttemptRef.current < 3 && peerOnlineRef.current) {
                tryReconnect();
              }
            }
          }, RECONNECT_AFTER_MS);
        } else if (s === 'failed') {
          setStatus('failed');
          if (peerOnlineRef.current && reconnectAttemptRef.current < 3) {
            reconnectAttemptRef.current += 1;
            tryReconnect();
          }
        }
      };

      // 3) signaling via Supabase Realtime broadcast
      const ch = supabase.channel(`call:${bookingId}`, { config: { broadcast: { ack: false }, presence: { key: session!.user.id } } });
      channelRef.current = ch;

      ch.on('broadcast', { event: 'signal' }, ({ payload }) => handleSignal(payload as { from: string; type: SignalType; data: any }))
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState();
          const others = Object.keys(state).filter(k => k !== session!.user.id);
          peerOnlineRef.current = others.length > 0;
          setRemoteOnline(others.length > 0);
          if (others.length > 0 && !initiatedRef.current) {
            initiatedRef.current = true;
            makeOffer();
          }
        });

      await ch.subscribe(async (s: string) => {
        if (s === 'SUBSCRIBED') {
          await ch.track({ user: session!.user.id, joinedAt: new Date().toISOString() });
          setStatus(prev => prev === 'preparing' ? 'waiting' : prev);
        }
      });
    } catch (e: any) {
      console.warn('call setup err', e);
      Alert.alert('Не удалось начать урок', e.message || 'Проверьте разрешение на камеру и микрофон');
      setStatus('failed');
    }
  }

  async function makeOffer() {
    const pc = pcRef.current;
    if (!pc) return;
    setStatus('connecting');
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      sendSignal('offer', { sdp: offer });
    } catch (e) { console.warn('offer err', e); }
  }

  async function handleSignal(payload: { from: string; type: SignalType; data: any }) {
    if (!session || payload.from === session.user.id) return;
    const pc = pcRef.current;
    if (!pc) return;
    try {
      if (payload.type === 'offer') {
        await pc.setRemoteDescription(payload.data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', { sdp: answer });
      } else if (payload.type === 'answer') {
        if (pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(payload.data.sdp);
        }
      } else if (payload.type === 'ice') {
        try { await pc.addIceCandidate(payload.data.candidate); } catch {}
      } else if (payload.type === 'bye') {
        teardown('peer-bye');
        setStatus('ended');
      }
    } catch (e) { console.warn('signal handle err', e); }
  }

  function sendSignal(type: SignalType, data: any) {
    const ch = channelRef.current;
    if (!ch || !session) return;
    ch.send({ type: 'broadcast', event: 'signal', payload: { from: session.user.id, type, data } });
  }

  async function tryReconnect() {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      sendSignal('offer', { sdp: offer });
    } catch (e) { console.warn('reconnect err', e); }
  }

  function toggleMic() {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    tracks.forEach(t => (t.enabled = !t.enabled));
    setMicOn(tracks[0]?.enabled ?? false);
  }
  function toggleCam() {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    tracks.forEach(t => (t.enabled = !t.enabled));
    setCamOn(tracks[0]?.enabled ?? false);
  }

  async function hangup() {
    sendSignal('bye', {});
    teardown('hangup');
    setStatus('ended');
    setTimeout(() => router.back(), 200);
  }

  function teardown(reason: string) {
    try { channelRef.current?.unsubscribe(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    pcRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    channelRef.current = null;
    initiatedRef.current = false;
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <View style={styles.root}>
      {/* Remote video (большой) */}
      <View style={styles.remoteWrap}>
        {Platform.OS === 'web' ? (
          // @ts-ignore — на web используем нативный <video>
          <video ref={(r: any) => (remoteVideoRef.current = r)} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        ) : null}
        {status !== 'connected' && (
          <View style={styles.statusOverlay} pointerEvents="none">
            {status === 'preparing' && <><ActivityIndicator color="#fff" size="large" /><Text style={styles.statusText}>Подготовка…</Text></>}
            {status === 'waiting' && <><Text style={styles.bigEmoji}>⏳</Text><Text style={styles.statusText}>Ожидание собеседника…</Text></>}
            {status === 'connecting' && <><ActivityIndicator color="#fff" size="large" /><Text style={styles.statusText}>Соединение…</Text></>}
            {status === 'failed' && (
              <>
                <Text style={styles.bigEmoji}>⚠️</Text>
                <Text style={styles.statusText}>Связь потеряна</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => tryReconnect()}>
                  <RefreshCw size={16} color="#fff" />
                  <Text style={styles.retryText}>Повторить</Text>
                </TouchableOpacity>
              </>
            )}
            {status === 'ended' && <><Text style={styles.bigEmoji}>👋</Text><Text style={styles.statusText}>Урок завершён</Text></>}
          </View>
        )}
      </View>

      {/* Local video (маленький) */}
      {Platform.OS === 'web' && (
        <View style={styles.localWrap}>
          {/* @ts-ignore */}
          <video ref={(r: any) => (localVideoRef.current = r)} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#222', transform: 'scaleX(-1)' }} />
          {!camOn && <View style={styles.localOff}><Text style={styles.localOffText}>Камера выкл.</Text></View>}
        </View>
      )}

      {/* Timer + status pill */}
      {status === 'connected' && (
        <View style={styles.timerPill}>
          <View style={styles.dotLive} />
          <Text style={styles.timerText}>{mmss}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrlBtn, !micOn && styles.ctrlBtnOff]} onPress={toggleMic}>
          {micOn ? <Mic size={22} color="#fff" /> : <MicOff size={22} color="#fff" />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.hangupBtn} onPress={hangup}>
          <PhoneOff size={26} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, !camOn && styles.ctrlBtnOff]} onPress={toggleCam}>
          {camOn ? <VideoOn size={22} color="#fff" /> : <VideoOff size={22} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  remoteWrap: { flex: 1, backgroundColor: '#000', position: 'relative' },
  statusOverlay: { position: 'absolute', inset: 0 as any, top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#000' },
  bigEmoji: { fontSize: 64 },
  statusText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#ffffff20', borderRadius: 10, borderWidth: 1, borderColor: '#ffffff40' },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  localWrap: { position: 'absolute', top: 16, right: 16, width: 140, height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#ffffff20', backgroundColor: '#1a1a1a' },
  localOff: { position: 'absolute', inset: 0 as any, top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1aee' },
  localOffText: { color: '#ffffff80', fontSize: 11 },
  timerPill: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#00000088', borderRadius: 20, borderWidth: 1, borderColor: '#ffffff20' },
  dotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
  timerText: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  controls: { position: 'absolute', bottom: 32, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18 },
  ctrlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffffff25', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ffffff30' },
  ctrlBtnOff: { backgroundColor: '#ff4444' },
  hangupBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ff3b3b', justifyContent: 'center', alignItems: 'center', shadowColor: '#ff3b3b', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  unsupported: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  unsupportedEmoji: { fontSize: 64 },
  unsupportedTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  unsupportedSub: { color: '#ffffffaa', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  closeBtn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 14, backgroundColor: '#ffffff20', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff40' },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
