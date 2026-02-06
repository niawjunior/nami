'use client';

import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

interface VoiceControlContextType {
  isVoiceModeEnabled: boolean;
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  toggleVoiceMode: () => void;
  lastTranscript: string | null;
  lastCommand: string | null; // Alias for lastTranscript for ChatInterface
  resetCommand: () => void;
  messages: { from: 'user' | 'assistant'; text: string }[];
}

const VoiceControlContext = createContext<VoiceControlContextType | undefined>(undefined);

export function VoiceControlProvider({ children }: { children: React.ReactNode }) {
  const [isVoiceModeEnabled, setIsVoiceModeEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ from: 'user' | 'assistant'; text: string }[]>([]);

  // WebRTC refs
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Get API port from window
  const getApiPort = () => (window as any).__API_PORT__ || 3001;

  // Get ephemeral token
  const getToken = async (): Promise<string> => {
    const response = await fetch(`http://localhost:${getApiPort()}/api/realtime/token`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.client_secret.value;
  };

  // Initialize WebRTC connection
  const initRealtimeConnection = useCallback(async () => {
    try {
      console.log('[Realtime] Initializing connection...');
      
      // 1. Get ephemeral token
      const ephemeralKey = await getToken();
      console.log('[Realtime] Token obtained');

      // 2. Create RTCPeerConnection
      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      // 3. Create audio element for AI responses
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;

      peer.ontrack = (e) => {
        console.log('[Realtime] Received audio track');
        audioEl.srcObject = e.streams[0];
        setIsSpeaking(true);
      };

      // 4. Capture user's microphone
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
      console.log('[Realtime] Microphone captured');

      // 5. Create data channel for events
      const dataChannel = peer.createDataChannel('oai-events');
      dataChannelRef.current = dataChannel;

      // 6. Create SDP offer
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      // 7. Send offer to OpenAI Realtime API
      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview';
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        throw new Error('Failed to establish WebRTC connection');
      }

      // 8. Set remote description
      const answer = {
        type: 'answer' as RTCSdpType,
        sdp: await sdpResponse.text(),
      };
      await peer.setRemoteDescription(answer);
      console.log('[Realtime] WebRTC connection established');

      // 9. Handle data channel events
      dataChannel.addEventListener('open', () => {
        console.log('[Realtime] Data channel open');
        setIsConnected(true);

        // Send session instructions for Nami persona
        dataChannel.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: `คุณคือผู้ช่วย AI ชื่อนามิ (Nami) เป็นผู้หญิงไทย พูดด้วยน้ำเสียงหวาน นุ่มนวล น่าฟัง เป็นธรรมชาติ สุภาพ และเป็นผู้หญิง ใช้คำลงท้ายว่า "ค่ะ" ตอบแบบให้คำปรึกษา อธิบายชัดเจน ให้คำแนะนำอย่างรอบคอบ มีความเป็นมิตรและเป็นมืออาชีพ คุณสามารถช่วยจัดการไฟล์ เปิดแอปพลิเคชัน และตอบคำถามทั่วไปได้`,
            voice: 'sage',
          },
        }));
      });

      dataChannel.addEventListener('message', (e) => {
        handleServerEvent(e);
      });

      dataChannel.addEventListener('close', () => {
        console.log('[Realtime] Data channel closed');
        setIsConnected(false);
      });

      dataChannel.addEventListener('error', (e) => {
        console.error('[Realtime] Data channel error:', e);
      });

    } catch (error) {
      console.error('[Realtime] Connection error:', error);
      setIsConnected(false);
      throw error;
    }
  }, []);

  // Handle server events
  const handleServerEvent = useCallback((e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data);
      console.log('[Realtime] Event:', event.type);

      switch (event.type) {
        // User speech transcription
        case 'conversation.item.input_audio_transcription.completed': {
          const userText = event.transcript || '';
          if (userText.trim()) {
            console.log('[Realtime] User said:', userText);
            setLastTranscript(userText);
            setMessages(prev => [...prev, { from: 'user', text: userText }]);
          }
          break;
        }

        // Assistant response audio transcript
        case 'response.audio_transcript.done': {
          const assistantText = event.transcript || '';
          if (assistantText.trim()) {
            console.log('[Realtime] Assistant said:', assistantText);
            setMessages(prev => [...prev, { from: 'assistant', text: assistantText }]);
          }
          setIsSpeaking(false);
          break;
        }

        // Response started
        case 'response.created': {
          setIsSpeaking(true);
          break;
        }

        // Response done
        case 'response.done': {
          setIsSpeaking(false);
          break;
        }

        default:
          // Log other events for debugging
          if (event.type.includes('error')) {
            console.error('[Realtime] Error event:', event);
          }
          break;
      }
    } catch (err) {
      console.error('[Realtime] Event parse error:', err);
    }
  }, []);

  // Close connection
  const closeConnection = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }
    setIsConnected(false);
    setIsSpeaking(false);
    console.log('[Realtime] Connection closed');
  }, []);

  // Toggle voice mode
  const toggleVoiceMode = useCallback(async () => {
    if (isVoiceModeEnabled) {
      // Turn OFF
      closeConnection();
      setIsVoiceModeEnabled(false);
    } else {
      // Turn ON
      setIsVoiceModeEnabled(true);
      try {
        await initRealtimeConnection();
      } catch (error) {
        console.error('[Realtime] Failed to connect:', error);
        setIsVoiceModeEnabled(false);
      }
    }
  }, [isVoiceModeEnabled, closeConnection, initRealtimeConnection]);

  // Reset command
  const resetCommand = useCallback(() => {
    setLastTranscript(null);
  }, []);

  return (
    <VoiceControlContext.Provider value={{
      isVoiceModeEnabled,
      isConnected,
      isListening: isConnected && !isSpeaking,
      isSpeaking,
      toggleVoiceMode,
      lastTranscript,
      lastCommand: lastTranscript, // Alias for ChatInterface
      resetCommand,
      messages,
    }}>
      {children}
    </VoiceControlContext.Provider>
  );
}

export const useVoiceControl = () => {
  const context = useContext(VoiceControlContext);
  if (!context) {
    throw new Error('useVoiceControl must be used within a VoiceControlProvider');
  }
  return context;
};
