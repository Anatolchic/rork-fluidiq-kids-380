import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Alert, Animated, Easing, FlatList, TextInput, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Mic, MicOff, Video as VideoOn, VideoOff, PhoneOff, RefreshCw, PenTool, Eraser, Trash2, X, Monitor, MonitorOff, Hand, Smile, MessageSquare, Send, PictureInPicture2, Sparkles } from 'lucide-react-native';
import supabase from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/auth';
import { getTurnIceServers, PEER_CONFIG_DEFAULTS, applyBitrateLimit } from '../../lib/webrtc';
import type { Message } from '../../lib/types';
import { useResponsive } from '../../lib/responsive';

const RECONNECT_AFTER_MS = 3000;

type SignalType = 'offer' | 'answer' | 'ice' | 'bye' | 'stroke' | 'clear';
type Stroke = { id: string; color: string; size: number; points: { x: number; y: number }[]; userId: string };
type FloatingReaction = { id: string; emoji: string; x: number; anim: Animated.Value };

const PALETTE = ['#ffffff', '#ff5252', '#ffd54f', '#66bb6a', '#4dabf5'];
const SIZES = [3, 7];
const REACTIONS = ['❤️', '🔥', '👍', '😂', '🎉', '👏'];

export default function CallScreen() {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const { isLandscape } = useResponsive();

  const [status, setStatus] = useState<'preparing' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'ended'>('preparing');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [boardOn, setBoardOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [elapsed, setElapsed] = useState(0);
  const [quality, setQuality] = useState<'excellent' | 'good' | 'fair' | 'poor' | 'unknown'>('unknown');

  // Reactions
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Hand raise
  const [handRaised, setHandRaised] = useState(false);
  const [peerHandRaised, setPeerHandRaised] = useState(false);
  const handPulse = useRef(new Animated.Value(1)).current;
  const peerHandPulse = useRef(new Animated.Value(1)).current;

  // PiP
  const [pipActive, setPipActive] = useState(false);
  const pipSupported = typeof document !== 'undefined' && (document as any).pictureInPictureEnabled;

  // Chat panel
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatChannelRef = useRef<any>(null);
  const chatListRef = useRef<FlatList<Message>>(null);
  const chatOpenRef = useRef(false);

  // Virtual background blur
  const [bgBlur, setBgBlur] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const statsTimerRef = useRef<any>(null);
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
      statsTimerRef.current = setInterval(measureQuality, 3000);
      measureQuality();
    } else if (timerRef.current) {
      clearInterval(timerRef.current); timerRef.current = null;
      if (statsTimerRef.current) { clearInterval(statsTimerRef.current); statsTimerRef.current = null; }
      setQuality('unknown');
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    };
  }, [status]);

  async function measureQuality() {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      let inboundVideo: any = null;
      let candidatePair: any = null;
      stats.forEach((r: any) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') inboundVideo = r;
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) candidatePair = r;
      });
      const rtt = candidatePair?.currentRoundTripTime ?? 0;
      const packetsLost = inboundVideo?.packetsLost ?? 0;
      const packetsReceived = inboundVideo?.packetsReceived ?? 1;
      const lossRatio = packetsLost / Math.max(packetsLost + packetsReceived, 1);
      // Quality grade
      let g: typeof quality = 'excellent';
      if (rtt > 0.3 || lossRatio > 0.05) g = 'poor';
      else if (rtt > 0.2 || lossRatio > 0.02) g = 'fair';
      else if (rtt > 0.1 || lossRatio > 0.005) g = 'good';
      setQuality(g);
    } catch {}
  }

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
        .on('broadcast', { event: 'reaction' }, ({ payload }: any) => {
          if (!session || payload?.from === session.user.id) return;
          if (payload?.emoji) spawnFloatingReaction(payload.emoji);
        })
        .on('broadcast', { event: 'hand' }, ({ payload }: any) => {
          if (!session || payload?.from === session.user.id) return;
          setPeerHandRaised(!!payload?.raised);
        })
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

  // ===== Reactions =====
  function spawnFloatingReaction(emoji: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const x = Math.round(20 + Math.random() * 60); // 20-80% width
    const anim = new Animated.Value(0);
    const item: FloatingReaction = { id, emoji, x, anim };
    setFloatingReactions(prev => [...prev, item]);
    Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    });
  }
  function sendReaction(emoji: string) {
    if (!session) return;
    spawnFloatingReaction(emoji);
    channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { from: session.user.id, emoji } });
    setReactionsOpen(false);
  }

  // ===== Hand raise =====
  function toggleHand() {
    if (!session) return;
    const next = !handRaised;
    setHandRaised(next);
    channelRef.current?.send({ type: 'broadcast', event: 'hand', payload: { from: session.user.id, raised: next } });
  }

  // Pulse animation for raised hands
  useEffect(() => {
    if (!handRaised) { handPulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(handPulse, { toValue: 1.25, duration: 600, useNativeDriver: true }),
      Animated.timing(handPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [handRaised, handPulse]);
  useEffect(() => {
    if (!peerHandRaised) { peerHandPulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(peerHandPulse, { toValue: 1.25, duration: 600, useNativeDriver: true }),
      Animated.timing(peerHandPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [peerHandRaised, peerHandPulse]);

  // ===== Picture-in-Picture =====
  async function togglePip() {
    if (typeof document === 'undefined' || !(document as any).pictureInPictureEnabled) {
      Alert.alert('PiP не поддерживается', 'Браузер не поддерживает Picture-in-Picture');
      return;
    }
    const v = remoteVideoRef.current as any;
    if (!v) return;
    try {
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
        setPipActive(false);
      } else {
        await v.requestPictureInPicture();
        setPipActive(true);
        v.addEventListener('leavepictureinpicture', () => setPipActive(false), { once: true });
      }
    } catch (e: any) {
      console.warn('pip err', e);
    }
  }

  // ===== Chat panel =====
  useEffect(() => {
    if (!bookingId) return;
    (async () => {
      const { data } = await supabase.from('chat_rooms').select('id').eq('booking_id', bookingId).maybeSingle();
      if (data?.id) setChatRoomId(data.id as string);
    })();
  }, [bookingId]);

  useEffect(() => {
    if (!chatRoomId) return;
    (async () => {
      const { data } = await supabase.from('messages').select('*').eq('room_id', chatRoomId).order('created_at', { ascending: true }).limit(200);
      setChatMessages((data || []) as Message[]);
    })();
    const ch = supabase
      .channel(`call-chat:${chatRoomId}`, { config: { broadcast: { ack: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${chatRoomId}` }, (payload: any) => {
        const m = payload.new as Message;
        setChatMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        if (!chatOpenRef.current && session && m.sender_id !== session.user.id) {
          setUnreadCount(c => c + 1);
        }
      })
      .subscribe();
    chatChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [chatRoomId, session?.user.id]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen && chatMessages.length > 0) {
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [chatOpen, chatMessages.length]);

  async function sendChatMessage() {
    if (!chatText.trim() || !session || !chatRoomId) return;
    const content = chatText.trim();
    setChatText('');
    setChatSending(true);
    const { error } = await supabase.from('messages').insert({
      room_id: chatRoomId, sender_id: session.user.id, content, type: 'text',
    });
    setChatSending(false);
    if (error) Alert.alert('Не отправлено', error.message);
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
    try { if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    try {
      if (typeof document !== 'undefined' && (document as any).pictureInPictureElement) {
        (document as any).exitPictureInPicture().catch(() => {});
      }
    } catch {}
    pcRef.current = null; localStreamRef.current = null; channelRef.current = null;
    chatChannelRef.current = null;
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
            {peerHandRaised && (
              <Animated.View style={[styles.handBadge, { transform: [{ scale: peerHandPulse }] }]}>
                <Text style={styles.handBadgeText}>✋</Text>
              </Animated.View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.remoteWrap}>
          {/* @ts-ignore */}
          <video ref={(r: any) => (remoteVideoRef.current = r)} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
          {peerHandRaised && (
            <Animated.View style={[styles.handBadgeLarge, { transform: [{ scale: peerHandPulse }] }]}>
              <Text style={styles.handBadgeLargeText}>✋</Text>
              <Text style={styles.handBadgeLabel}>Поднял руку</Text>
            </Animated.View>
          )}
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
        <View style={[styles.localWrap, isLandscape ? { top: 16, left: 16, right: undefined, width: 160, height: 120 } : { top: 16, right: 16, left: undefined, width: 180, height: 240 }]}>
          {/* @ts-ignore */}
          <video ref={(r: any) => (localVideoRef.current = r)} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#222', transform: 'scaleX(-1)', filter: bgBlur ? 'blur(10px)' : 'none' }} />
          {bgBlur && (
            <View pointerEvents="none" style={styles.bgBlurOverlay} />
          )}
          {!camOn && <View style={styles.localOff}><Text style={styles.localOffText}>Камера выкл.</Text></View>}
          {handRaised && (
            <Animated.View style={[styles.handBadge, { transform: [{ scale: handPulse }] }]}>
              <Text style={styles.handBadgeText}>✋</Text>
            </Animated.View>
          )}
        </View>
      )}

      {/* Hidden local video element when board on (чтобы трек продолжал отправляться) */}
      {boardOn && (
        // @ts-ignore
        <video ref={(r: any) => (localVideoRef.current = r)} autoPlay playsInline muted style={{ display: 'none' }} />
      )}

      {/* Timer + quality */}
      {status === 'connected' && (
        <View style={styles.timerPill}>
          <View style={styles.dotLive} />
          <Text style={styles.timerText}>{mmss}</Text>
          <View style={styles.qualBars}>
            {[1, 2, 3, 4].map(b => {
              const active = qualityLevel(quality) >= b;
              return <View key={b} style={[styles.qualBar, { height: 4 + b * 2, backgroundColor: active ? qualityColor(quality) : '#ffffff33' }]} />;
            })}
          </View>
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

      {/* Floating reactions overlay */}
      {floatingReactions.length > 0 && (
        <View pointerEvents="none" style={styles.reactionsOverlay}>
          {floatingReactions.map(r => {
            const translateY = r.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -200] });
            const opacity = r.anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
            const scale = r.anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.2, 1] });
            return (
              <Animated.View key={r.id} style={[styles.floatReact, { left: `${r.x}%`, transform: [{ translateY }, { scale }], opacity }]}>
                <Text style={styles.floatReactEmoji}>{r.emoji}</Text>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* Reactions picker modal */}
      <Modal visible={reactionsOpen} transparent animationType="fade" onRequestClose={() => setReactionsOpen(false)}>
        <Pressable style={styles.reactionsBackdrop} onPress={() => setReactionsOpen(false)}>
          <View style={styles.reactionsPopover}>
            {REACTIONS.map(emoji => (
              <TouchableOpacity key={emoji} style={styles.reactionItem} onPress={() => sendReaction(emoji)}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Chat panel */}
      {chatOpen && (
        <View style={styles.chatPanel}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatHeaderTitle}>Чат урока</Text>
            <TouchableOpacity onPress={() => setChatOpen(false)} style={styles.chatCloseBtn}>
              <X size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.chatList}
            renderItem={({ item }) => {
              const isOwn = item.sender_id === session?.user.id;
              return (
                <View style={[styles.chatMsgRow, isOwn ? styles.chatMsgRowOwn : styles.chatMsgRowPeer]}>
                  <View style={[styles.chatBubble, isOwn ? styles.chatBubbleOwn : styles.chatBubblePeer]}>
                    {item.type === 'image' && item.file_url ? (
                      <Text style={styles.chatBubbleText}>📷 Фото (откройте основной чат)</Text>
                    ) : (
                      <Text style={styles.chatBubbleText}>{item.content}</Text>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.chatEmpty}>Пока сообщений нет</Text>}
          />
          <View style={styles.chatInputWrap}>
            <TextInput
              style={styles.chatInput}
              value={chatText}
              onChangeText={setChatText}
              placeholder="Сообщение…"
              placeholderTextColor="#ffffff66"
              multiline
              maxLength={2000}
              editable={!chatSending}
            />
            <TouchableOpacity style={styles.chatSendBtn} onPress={sendChatMessage} disabled={!chatText.trim() || chatSending}>
              {chatSending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
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
        <TouchableOpacity style={[styles.ctrlBtn, handRaised && styles.ctrlBtnPrimary]} onPress={toggleHand}>
          <Hand size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, reactionsOpen && styles.ctrlBtnPrimary]} onPress={() => setReactionsOpen(true)}>
          <Smile size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, chatOpen && styles.ctrlBtnPrimary]} onPress={() => setChatOpen(o => !o)}>
          <MessageSquare size={22} color="#fff" />
          {unreadCount > 0 && !chatOpen && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
            </View>
          )}
        </TouchableOpacity>
        {pipSupported && (
          <TouchableOpacity style={[styles.ctrlBtn, pipActive && styles.ctrlBtnPrimary]} onPress={togglePip}>
            <PictureInPicture2 size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.ctrlBtn, bgBlur && styles.ctrlBtnPrimary]} onPress={() => setBgBlur(b => !b)}>
          <Sparkles size={22} color="#fff" />
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

function qualityLevel(q: string): number {
  return q === 'excellent' ? 4 : q === 'good' ? 3 : q === 'fair' ? 2 : q === 'poor' ? 1 : 0;
}
function qualityColor(q: string): string {
  return q === 'excellent' || q === 'good' ? '#4CAF50' : q === 'fair' ? '#FF9800' : q === 'poor' ? '#F44336' : '#ffffff66';
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
  timerPill: { position: 'absolute', top: 16, left: '50%' as any, marginLeft: -68, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#00000099', borderRadius: 20, borderWidth: 1, borderColor: '#ffffff20' },
  dotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
  timerText: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  qualBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  qualBar: { width: 3, borderRadius: 1 },
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

  // Reactions
  reactionsOverlay: { position: 'absolute', left: 0, right: 0, bottom: 100, top: 100, pointerEvents: 'none' as any },
  floatReact: { position: 'absolute', bottom: 0 },
  floatReactEmoji: { fontSize: 42 },
  reactionsBackdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#00000066', paddingBottom: 120 },
  reactionsPopover: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: '#1a1a2eee', borderRadius: 24, borderWidth: 1, borderColor: '#ffffff20' },
  reactionItem: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 24 },
  reactionEmoji: { fontSize: 28 },

  // Hand badges
  handBadge: { position: 'absolute', top: 8, left: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffd54fee', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  handBadgeText: { fontSize: 16 },
  handBadgeLarge: { position: 'absolute', top: 70, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#ffd54fee', borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  handBadgeLargeText: { fontSize: 20 },
  handBadgeLabel: { color: '#0c0c1f', fontSize: 13, fontWeight: '700' },

  // Background blur overlay (extra effect)
  bgBlurOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000022', backdropFilter: 'blur(6px)' as any },

  // Unread badge on chat button
  unreadBadge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: '#ff3b3b', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#0c0c1f' },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Chat panel
  chatPanel: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, backgroundColor: '#0c0c1fee', borderLeftWidth: 1, borderLeftColor: '#ffffff20', flexDirection: 'column', maxWidth: '100%' as any },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ffffff15' },
  chatHeaderTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  chatCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffffff15', justifyContent: 'center', alignItems: 'center' },
  chatList: { padding: 12, gap: 6, flexGrow: 1 },
  chatMsgRow: { flexDirection: 'row', marginVertical: 2 },
  chatMsgRowOwn: { justifyContent: 'flex-end' },
  chatMsgRowPeer: { justifyContent: 'flex-start' },
  chatBubble: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  chatBubbleOwn: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  chatBubblePeer: { backgroundColor: '#ffffff18', borderBottomLeftRadius: 4 },
  chatBubbleText: { color: '#fff', fontSize: 14, lineHeight: 19 },
  chatEmpty: { color: '#ffffff66', fontSize: 13, textAlign: 'center', marginTop: 40 },
  chatInputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#ffffff15' },
  chatInput: { flex: 1, minHeight: 38, maxHeight: 100, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#ffffff15', borderRadius: 12, color: '#fff', fontSize: 14 },
  chatSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
});
