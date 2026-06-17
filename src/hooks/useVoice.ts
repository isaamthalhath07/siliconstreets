'use client';

// Silicon Streets — "Communication Infrastructure". A peer-to-peer voice mesh
// over native WebRTC; Socket.io only relays signaling (offer/answer/ICE) and
// mic presence. To avoid offer glare in a full mesh, the peer with the smaller
// playerId always initiates; the other answers. Presence echo closes the
// discovery gap so a late joiner and an existing speaker always find each other.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  C2S, S2C,
  type VoiceSignalMsg, type VoicePresenceMsg,
} from '@/server/protocol';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export type LinkState = RTCPeerConnectionState | 'idle';

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
}

export interface UseVoice {
  enabled: boolean;
  muted: boolean;
  toggleVoice: () => void;
  toggleMute: () => void;
  /** Per-peer transport status, for the signal-strength indicator. */
  links: Record<string, LinkState>;
  /** Whether each peer currently has their mic on. */
  remoteActive: Record<string, boolean>;
  error: string | null;
}

export function useVoice(socket: Socket | null, me: string | null): UseVoice {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [links, setLinks] = useState<Record<string, LinkState>>({});
  const [remoteActive, setRemoteActive] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const peers = useRef<Map<string, Peer>>(new Map());
  const stream = useRef<MediaStream | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setLink = (id: string, s: LinkState) =>
    setLinks((prev) => ({ ...prev, [id]: s }));

  // --- peer lifecycle --------------------------------------------------------
  const closePeer = useCallback((id: string) => {
    const p = peers.current.get(id);
    if (!p) return;
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    p.audio.srcObject = null;
    p.audio.remove(); // detach the hidden <audio> from the DOM
    peers.current.delete(id);
    setLink(id, 'idle');
  }, []);

  const makePeer = useCallback(
    (id: string, initiator: boolean): Peer | null => {
      if (!socket || !stream.current || peers.current.has(id)) {
        return peers.current.get(id) ?? null;
      }
      const pc = new RTCPeerConnection(ICE);
      stream.current.getTracks().forEach((t) => pc.addTrack(t, stream.current!));
      // Remote audio must be attached to the DOM to play reliably under browser
      // autoplay policies; a detached `new Audio()` is silently muted.
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        void audio.play().catch(() => undefined);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit(C2S.Voice, { to: id, data: { candidate: e.candidate } });
      };
      pc.onconnectionstatechange = () => setLink(id, pc.connectionState);
      const peer: Peer = { pc, audio };
      peers.current.set(id, peer);
      setLink(id, pc.connectionState);
      if (initiator) {
        void pc
          .createOffer()
          .then((o) => pc.setLocalDescription(o))
          .then(() => socket.emit(C2S.Voice, { to: id, data: { sdp: pc.localDescription } }))
          .catch(() => undefined);
      }
      return peer;
    },
    [socket],
  );

  // --- signaling + presence (bound once per socket) -------------------------
  useEffect(() => {
    if (!socket) return;

    const onSignal = async (m: VoiceSignalMsg) => {
      if (m.to !== meRef.current || !enabledRef.current) return;
      const data = m.data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      try {
        if (data.sdp) {
          if (data.sdp.type === 'offer') makePeer(m.from, false);
          const pc = peers.current.get(m.from)?.pc;
          if (!pc) return;
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === 'offer') {
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            socket.emit(C2S.Voice, { to: m.from, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          await peers.current.get(m.from)?.pc.addIceCandidate(data.candidate);
        }
      } catch {
        /* transient negotiation races are recoverable; ignore */
      }
    };

    const onPresence = (m: VoicePresenceMsg) => {
      if (m.playerId === meRef.current) return;
      setRemoteActive((prev) => ({ ...prev, [m.playerId]: m.active }));
      const mine = meRef.current;
      if (!m.active) return closePeer(m.playerId);
      if (!enabledRef.current || !mine) return;
      if (mine < m.playerId) {
        makePeer(m.playerId, true); // I'm the initiator for this pair
      } else {
        // I answer; re-announce so the (smaller-id) initiator learns I'm here.
        socket.emit(C2S.VoicePresence, { active: true });
      }
    };

    socket.on(S2C.Voice, onSignal);
    socket.on(S2C.VoicePresence, onPresence);
    return () => {
      socket.off(S2C.Voice, onSignal);
      socket.off(S2C.VoicePresence, onPresence);
    };
  }, [socket, makePeer, closePeer]);

  // --- controls --------------------------------------------------------------
  const toggleVoice = useCallback(async () => {
    if (enabledRef.current) {
      socket?.emit(C2S.VoicePresence, { active: false });
      peers.current.forEach((_, id) => closePeer(id));
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setEnabled(false);
      setMuted(false);
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setEnabled(true);
      setError(null);
      socket?.emit(C2S.VoicePresence, { active: true }); // announce + discover
    } catch {
      setError('microphone access denied');
    }
  }, [socket, closePeer]);

  const toggleMute = useCallback(() => {
    const tracks = stream.current?.getAudioTracks() ?? [];
    const next = !muted;
    tracks.forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      peers.current.forEach((p) => {
        p.pc.close();
        p.audio.remove();
      });
      peers.current.clear();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { enabled, muted, toggleVoice, toggleMute, links, remoteActive, error };
}
