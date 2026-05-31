import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Mic, MicOff, Video as VideoOn, VideoOff, PhoneOff, RefreshCw, PenTool, Eraser, Trash2, X, Monitor, MonitorOff } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { getTurnIceServers, PEER_CONFIG_DEFAULTS, applyBitrateLimit } from '../../lib/webrtc';

const RECONNECT_AFTER_MS = 3000;

type SignalType = 'offer' | 'answer' | 'ice' | 'bye' | 'stroke' | 'clear';
type Stroke = { id: string; color: string; size: number; points: { x: number; y: number }[]; userId: string };

const PALETTE = ['#ffffff', '#ff5252', '#ffd54f', '#66bb6a', '#4dabf5'];
const SIZES = [3, 7];

export default function CallScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();

  const [status, setStatus] = useState<'preparing' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'ended'>('preparing');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [boardOn, setBoardOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [elapsed, setElapsed] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const initiatedRef = useRef(false);
  const peerOnlineRef = useRef(false);
  const timerRef = useRef<any>(null);
  const reconnectAttemptRef = useRef(0);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.unsupportedEmoji}>📹</Text>
        <Text style={styles.unsupportedTitle}>Видеоурок доступен в веб-версии</Text>
        <Text style={styles.unsupportedSub}>Откройте web.repetitory-app.ru на ноутбуке или телефоне в браузере. Нативная iOS/Android-сборка появится в следующей версии.</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeText}>Закрыть</Text>
        </TouchableOpacity>
      </View>
    );
  }

  useEffect(() => {
    if (!bookingId || !session) return;
    setup();
    return () => { teardown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current); timerRef.current = null;
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
    if (remoteVideoRef.current) {
      (remoteVideoRef.current as any).srcObject = stream;
      remoteVideoRef.current.play?.().catch(() => {});
    }
  }

  async function setup() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      attachLocalStream(stream);

      const iceServers = await getTurnIceServers(session!.user.id);
      const pc = new RTCPeerConnection({ ...PEER_CONFIG_DEFAULTS, iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = (e: RTCTrackEvent) => { if (e.streams[0]) attachRemoteStream(e.streams[0]); };
      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate) sendSignal('ice', { candidate: e.candidate.toJSON() }); };
      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') {
          setStatus('connected');
          reconnectAttemptRef.current = 0;
          applyBitrateLimit(pc, 1500).catch(() => {});
        } else if (s === 'disconnected') {
          setStatus('connecting');
          setTimeout(() => {
            if (pcRef.current?.iceConnectionState === 'disconnected' && reconnectAttemptRef.current < 3 && peerOnlineRef.current) {
              reconnectAttemptRef.current += 1; tryReconnect();
            }
          }, RECONNECT_AFTER_MS);
        } else if (s === 'failed') {
          setStatus('failed');
          if (peerOnlineRef.current && reconnectAttemptRef.current < 3) { reconnectAttemptRef.current += 1; tryReconnect(); }
        }
      };

      const ch = supabase.channel(`call:${bookingId}`, { config: { broadcast: { ack: false }, presence: { key: session!.user.id } } });
      channelRef.current = ch;

      ch.on('broadcast', { event: 'signal' }, ({ payload }: any) => handleSignal(payload))
        .on('broadcast', { event: 'stroke' }, ({ payload }: any) => onRemoteStroke(payload as Stroke))
        .on('broadcast', { event: 'clear' }, () => { strokesRef.current = []; clearCanvas(); })
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState();
          const others = Object.keys(state).filter(k => k !== session!.user.id);
          peerOnlineRef.current = others.length > 0;
          if (others.length > 0 && !initiatedRef.current) {
            initiatedRef.current = true; makeOffer();
          }
        });

      await ch.subscribe(async (s: string) => {
        if (s === 'SUBSCRIBED') {
          await ch.track({ user: session!.user.id, joinedAt: new Date().toISOString() });
          setStatus(prev => prev === 'preparing' ? 'waiting' : prev);
        }
      });
    } catch (e: any) {
      Alert.alert('Не удалось начать урок', e.message || 'Проверьте разрешение на камеру и микрофон');
      setStatus('failed');
    }
  }

  async function makeOffer() {
    const pc = pcRef.current; if (!pc) return;
    setStatus('connecting');
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      sendSignal('offer', { sdp: offer });
    } catch (e) { console.warn('offer err', e); }
  }
  async function tryReconnect() {
    const pc = pcRef.current; if (!pc) return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      sendSignal('offer', { sdp: offer });
    } catch {}
  }
  async function handleSignal(payload: { from: string; type: SignalType; data: any }) {
    if (!session || payload.from === session.user.id) return;
    const pc = pcRef.current; if (!pc) return;
    try {
      if (payload.type === 'offer') {
        await pc.setRemoteDescription(payload.data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', { sdp: answer });
      } else if (payload.type === 'answer') {
        if (pc.signalingState !== 'stable') await pc.setRemoteDescription(payload.data.sdp);
      } else if (payload.type === 'ice') {
        try { await pc.addIceCandidate(payload.data.candidate); } catch {}
      } else if (payload.type === 'bye') {
        teardown(); setStatus('ended');
      }
    } catch (e) { console.warn('signal err', e); }
  }
  function sendSignal(type: SignalType, data: any) {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { from: session!.user.id, type, data } });
  }

  // ===== Whiteboard =====
  const setupCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = el.getBoundingClientRect();
    el.width = Math.round(rect.width * dpr);
    el.height = Math.round(rect.height * dpr);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    redrawAll();
  }, []);

  function clearCanvas() {
    const c = canvasRef.current, ctx = ctxRef.current;
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
  }
  function drawStroke(s: Stroke) {
    const ctx = ctxRef.current; if (!ctx || s.points.length < 1) return;
    ctx.strokeStyle = s.color === 'eraser' ? '#0c0c1f' : s.color;
    ctx.lineWidth = s.size * 2;
    ctx.globalCompositeOperation = s.color === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
  }
  function redrawAll() {
    clearCanvas();
    for (const s of strokesRef.current) drawStroke(s);
  }
  function pointFromEvent(e: React.PointerEvent | React.MouseEvent): { x: number; y: number } | null {
    const c = canvasRef.current; if (!c) return null;
    const rect = c.getBoundingClientRect();
    return { x: (e as any).clientX - rect.left, y: (e as any).clientY - rect.top };
  }
  function startDraw(e: React.PointerEvent) {
    if (!boardOn) return;
    const p = pointFromEvent(e); if (!p) return;
    const s: Stroke = {
      id: `${session!.user.id}-${Date.now()}`,
      color: tool === 'eraser' ? 'eraser' : color,
      size,
      points: [p],
      userId: session!.user.id,
    };
    drawingRef.current = s;
    strokesRef.current.push(s);
    drawStroke(s);
  }
  function moveDraw(e: React.PointerEvent) {
    const s = drawingRef.current; if (!s) return;
    const p = pointFromEvent(e); if (!p) return;
    s.points.push(p);
    const ctx = ctxRef.current; if (!ctx) return;
    ctx.strokeStyle = s.color === 'eraser' ? '#0c0c1f' : s.color;
    ctx.lineWidth = s.size * 2;
    ctx.globalCompositeOperation = s.color === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath();
    const a = s.points[s.points.length - 2], b = s.points[s.points.length - 1];
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function endDraw() {
    const s = drawingRef.current; if (!s) return;
    channelRef.current?.send({ type: 'broadcast', event: 'stroke', payload: s });
    drawingRef.current = null;
  }
  function onRemoteStroke(s: Stroke) {
    if (!session || s.userId === session.user.id) return;
    strokesRef.current.push(s);
    if (!boardOn) setBoardOn(true);
    setTimeout(() => drawStroke(s), 0);
  }
  function clearAll() {
    strokesRef.current = [];
    clearCanvas();
    channelRef.current?.send({ type: 'broadcast', event: 'clear', payload: {} });
  }

  // ===== Controls =====
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

  async function toggleScreenShare() {
    const pc = pcRef.current;
    if (!pc || !localStreamRef.current) return;
    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (!videoSender) return;

    if (!screenOn) {
      try {
        const screen = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } },
          audio: false,
        });
        const screenTrack = screen.getVideoTracks()[0];
        await videoSender.replaceTrack(screenTrack);
        if (localVideoRef.current) (localVideoRef.current as any).srcObject = screen;
        setScreenOn(true);
        screenTrack.onended = () => stopScreenShare();
        // Уменьшим битрейт для шаринга экрана (текст важнее fps)
        applyBitrateLimit(pc, 2500).catch(() => {});
      } catch (e: any) {
        if (e.name !== 'NotAllowedError') Alert.alert('Не удалось включить шаринг экрана', e.message);
      }
    } else {
      stopScreenShare();
    }
  }

  async function stopScreenShare() {
    const pc = pcRef.current;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!pc || !cameraTrack) return;
    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (videoSender) await videoSender.replaceTrack(cameraTrack);
    if (localVideoRef.current) (localVideoRef.current as any).srcObject = localStreamRef.current;
    setScreenOn(false);
    applyBitrateLimit(pc, 1500).catch(() => {});
  }
  async function hangup() {
    sendSignal('bye', {});
    teardown(); setStatus('ended');
    setTimeout(() => router.back(), 200);
  }
  function teardown() {
    try { channelRef.current?.unsubscribe(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    pcRef.current = null; localStreamRef.current = null; channelRef.current = null;
    initiatedRef.current = false;
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <View style={styles.root}>
      {/* Layout: с доской — видео слева в углу, доска в центре. Без доски — видео fullscreen */}
      {boardOn ? (
        <View style={styles.boardLayout}>
          {/* @ts-ignore */}
          <canvas
            ref={setupCanvas as any}
            onPointerDown={startDraw as any}
            onPointerMove={moveDraw as any}
            onPointerUp={endDraw as any}
            onPointerLeave={endDraw as any}
            style={{ flex: 1, background: '#0c0c1f', touchAction: 'none', cursor: tool === 'eraser' ? 'crosshair' : 'crosshair', width: '100%', height: '100%' }}
          />
          <View style={styles.remoteCorner}>
            {/* @ts-ignore */}
            <video ref={(r: any) => (remoteVideoRef.current = r)} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
          </View>
        </View>
      ) : (
        <View style={styles.remoteWrap}>
          {/* @ts-ignore */}
          <video ref={(r: any) => (remoteVideoRef.current = r)} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
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
      )}

      {/* Local PiP — только если доска выкл */}
      {!boardOn && (
        <View style={styles.localWrap}>
          {/* @ts-ignore */}
          <video ref={(r: any) => (localVideoRef.current = r)} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#222', transform: 'scaleX(-1)' }} />
          {!camOn && <View style={styles.localOff}><Text style={styles.localOffText}>Камера выкл.</Text></View>}
        </View>
      )}

      {/* Hidden local video element when board on (чтобы трек продолжал отправляться) */}
      {boardOn && (
        // @ts-ignore
        <video ref={(r: any) => (localVideoRef.current = r)} autoPlay playsInline muted style={{ display: 'none' }} />
      )}

      {/* Timer */}
      {status === 'connected' && (
        <View style={styles.timerPill}>
          <View style={styles.dotLive} />
          <Text style={styles.timerText}>{mmss}</Text>
        </View>
      )}

      {/* Whiteboard toolbar */}
      {boardOn && (
        <View style={styles.boardToolbar}>
          <TouchableOpacity style={[styles.toolBtn, tool === 'pen' && styles.toolBtnActive]} onPress={() => setTool('pen')}>
            <PenTool size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toolBtn, tool === 'eraser' && styles.toolBtnActive]} onPress={() => setTool('eraser')}>
            <Eraser size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.toolDivider} />
          {PALETTE.map(c => (
            <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, color === c && tool === 'pen' && styles.colorDotActive]} onPress={() => { setColor(c); setTool('pen'); }} />
          ))}
          <View style={styles.toolDivider} />
          {SIZES.map(s => (
            <TouchableOpacity key={s} style={[styles.sizeBtn, size === s && styles.sizeBtnActive]} onPress={() => setSize(s)}>
              <View style={{ width: s * 2, height: s * 2, borderRadius: s, backgroundColor: '#fff' }} />
            </TouchableOpacity>
          ))}
          <View style={styles.toolDivider} />
          <TouchableOpacity style={styles.toolBtn} onPress={clearAll}>
            <Trash2 size={18} color="#ff5252" />
          </TouchableOpacity>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrlBtn, !micOn && styles.ctrlBtnOff]} onPress={toggleMic}>
          {micOn ? <Mic size={22} color="#fff" /> : <MicOff size={22} color="#fff" />}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, boardOn && styles.ctrlBtnPrimary]} onPress={() => setBoardOn(!boardOn)}>
          {boardOn ? <X size={22} color="#fff" /> : <PenTool size={22} color="#fff" />}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, screenOn && styles.ctrlBtnPrimary]} onPress={toggleScreenShare}>
          {screenOn ? <MonitorOff size={22} color="#fff" /> : <Monitor size={22} color="#fff" />}
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
  root: { flex: 1, backgroundColor: '#0c0c1f' },
  remoteWrap: { flex: 1, backgroundColor: '#000', position: 'relative' },
  boardLayout: { flex: 1, position: 'relative' },
  remoteCorner: { position: 'absolute', top: 16, left: 16, width: 140, height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#ffffff20', backgroundColor: '#1a1a1a' },
  statusOverlay: { position: 'absolute', inset: 0 as any, top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#000' },
  bigEmoji: { fontSize: 64 },
  statusText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#ffffff20', borderRadius: 10, borderWidth: 1, borderColor: '#ffffff40' },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  localWrap: { position: 'absolute', top: 16, right: 16, width: 140, height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#ffffff20', backgroundColor: '#1a1a1a' },
  localOff: { position: 'absolute', inset: 0 as any, top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1aee' },
  localOffText: { color: '#ffffff80', fontSize: 11 },
  timerPill: { position: 'absolute', top: 16, left: '50%' as any, marginLeft: -48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#00000099', borderRadius: 20, borderWidth: 1, borderColor: '#ffffff20' },
  dotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
  timerText: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  boardToolbar: { position: 'absolute', bottom: 110, left: '50%' as any, transform: [{ translateX: -180 } as any], flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#000000cc', borderRadius: 14, borderWidth: 1, borderColor: '#ffffff20', backdropFilter: 'blur(8px)' as any },
  toolBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ffffff15', justifyContent: 'center', alignItems: 'center' },
  toolBtnActive: { backgroundColor: COLORS.primary },
  toolDivider: { width: 1, height: 22, backgroundColor: '#ffffff25', marginHorizontal: 4 },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: COLORS.primary, transform: [{ scale: 1.1 } as any] },
  sizeBtn: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff10' },
  sizeBtnActive: { backgroundColor: '#ffffff25' },
  controls: { position: 'absolute', bottom: 32, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
  ctrlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffffff25', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ffffff30' },
  ctrlBtnOff: { backgroundColor: '#ff4444' },
  ctrlBtnPrimary: { backgroundColor: COLORS.primary },
  hangupBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ff3b3b', justifyContent: 'center', alignItems: 'center', shadowColor: '#ff3b3b', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  unsupported: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  unsupportedEmoji: { fontSize: 64 },
  unsupportedTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  unsupportedSub: { color: '#ffffffaa', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  closeBtn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 14, backgroundColor: '#ffffff20', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff40' },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
