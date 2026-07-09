"use client";

import React, { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/utils/supabase/client';

export default function TechnicianWorkspace({ params }: { params: Promise<{ jobId: string }> }) {
  const router = useRouter();
  const { jobId } = use(params);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Added state to track if the camera has been permitted and started
  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [status, setStatus] = useState<"Waiting for Camera" | "Connecting..." | "AI Online" | "Error" | "Disconnected">("Waiting for Camera");
  const [isEnding, setIsEnding] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(isPaused);

  // Job context for the header label
  const [jobType, setJobType] = useState<string>("Diagnostic");

  // Conversation transcript + ARIA's current spoken message
  type ChatMessage = { role: "tech" | "aria"; text: string };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentAriaMessage, setCurrentAriaMessage] = useState<string>("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Push-to-talk: mic audio is only streamed while the technician holds the button
  const [isHolding, setIsHolding] = useState(false);
  const isHoldingRef = useRef(isHolding);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    isHoldingRef.current = isHolding;
  }, [isHolding]);

  // Auto-scroll the transcript to the newest message
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Audio playback queue
  const audioQueue = useRef<HTMLAudioElement[]>([]);
  const isPlaying = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Refs for cleanup
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  // The function is now triggered manually by the button, not automatically
  const startCameraAndAudio = async () => {
    try {
      // --- THE SAFARI AUDIO UNLOCKER ---
      // This is a microscopic, completely silent WAV file.
      // Playing it immediately on tap permanently unlocks Safari's speaker access.
      const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      const unlockAudio = new Audio(silentWav);
      unlockAudio.play().catch(e => console.log("Silent unlock failed:", e));
      // ---------------------------------

      setStatus("Connecting...");

      const supabase = createClient();
      const { data: jobData } = await supabase
        .from('jobs')
        .select('job_type')
        .eq('id', jobId)
        .single();

      if (jobData?.job_type) {
        setJobType(jobData.job_type);
      }

      // 1. Check if Apple is hiding the Camera API entirely (Usually an HTTP vs HTTPS issue)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("🚨 SECURITY BLOCK: Safari hid the camera API. Check that your URL starts with 'https://'");
        setStatus("Error");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsCameraStarted(true);

      // Setup WebSocket. The backend URL comes from NEXT_PUBLIC_BACKEND_WS_URL so it
      // can be configured per environment (Vercel/local/tunnel) without code changes.
      let wsUrl = process.env.NEXT_PUBLIC_BACKEND_WS_URL || "wss://pretense-citable-uncut.ngrok-free.dev/ws";
      if (jobData?.job_type) {
        wsUrl += `?job_type=${encodeURIComponent(jobData.job_type)}`;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("AI Online");

        // Set up audio capture using AudioContext and AudioWorklet
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const setupAudioWorklet = async () => {
            const audioCtx = new AudioContextClass({ sampleRate: 16000 });
            audioCtxRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);
            sourceRef.current = source;

            await audioCtx.audioWorklet.addModule('/audio-processor.js');
            const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');
            workletNodeRef.current = workletNode;

            source.connect(workletNode);
            workletNode.connect(audioCtx.destination);

            workletNode.port.onmessage = (event) => {
              if (isPausedRef.current) return;
              // Push-to-talk: only stream mic audio while the technician holds the button
              if (!isHoldingRef.current) return;
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                const inputData = event.data;
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  const s = Math.max(-1, Math.min(1, inputData[i]));
                  pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                const buffer = new Uint8Array(pcmData.buffer);
                let binary = '';
                for (let i = 0; i < buffer.byteLength; i++) {
                  binary += String.fromCharCode(buffer[i]);
                }
                const base64Audio = window.btoa(binary);

                wsRef.current.send(JSON.stringify({
                  type: "audio",
                  data: base64Audio
                }));
              }
            };
          };
          setupAudioWorklet().catch(e => console.error("Error setting up audio worklet:", e));
        }

        // Start sending video frames
        intervalIdRef.current = setInterval(() => {
          captureAndSendFrame();
        }, 2000);
      };

      ws.onmessage = (event) => {
        if (isPausedRef.current) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "audio" && message.data) {
            playAudio(message.data);
          }
          // Live conversation transcript (both technician and ARIA)
          else if (message.type === "transcript" && message.text) {
            const role: "tech" | "aria" = message.role === "tech" ? "tech" : "aria";
            setMessages((prev) => [...prev, { role, text: message.text }]);
            if (role === "aria") {
              setCurrentAriaMessage(message.text);
            }
          }
          // THE KILL SWITCH: If the AI hears you, empty the queue and stop playing!
          else if (message.type === "interrupt") {
            console.log("User interrupted! Clearing audio queue...");
            audioQueue.current = []; // Empty the upcoming audio
            if (currentAudioRef.current) {
              currentAudioRef.current.pause(); // Stop the current audio
              currentAudioRef.current = null;
              isPlaying.current = false;
            }
          }
        } catch (e) {
          console.error("Error parsing message", e);
        }
      };

      ws.onerror = () => setStatus("Error");
      ws.onclose = () => {
        setStatus("Disconnected");
        if (intervalIdRef.current) clearInterval(intervalIdRef.current);
      };

    } catch (err) {
      console.error("Error accessing media devices.", err);
      // THIS IS THE MAGIC LINE: It forces the phone to show us the error!
      const e = err as Error;
      alert(`🚨 CAMERA ERROR: ${e.name} - ${e.message}`);
      setStatus("Error");
    }
  };

  // Only handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
      if (wsRef.current) wsRef.current.close();
      if (workletNodeRef.current) workletNodeRef.current.disconnect();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  const captureAndSendFrame = () => {
    if (isPausedRef.current) return;
    if (!videoRef.current || !canvasRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(blob);
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const playAudio = (base64Audio: string) => {
    const audioSrc = `data:audio/wav;base64,${base64Audio}`;
    const audio = new Audio(audioSrc);
    audioQueue.current.push(audio);
    playNextAudio();
  };

  const playNextAudio = () => {
    if (isPlaying.current || audioQueue.current.length === 0) return;

    isPlaying.current = true;
    const audio = audioQueue.current.shift();
    if (audio) {
      currentAudioRef.current = audio; // Track the playing chunk so pause/interrupt can stop it
      audio.onended = () => {
        currentAudioRef.current = null;
        isPlaying.current = false;
        playNextAudio();
      };
      // THE FIX: We catch the error quietly so Next.js ignores it.
      audio.play().catch(e => {
        console.warn(`Audio chunk skipped: ${e.name}`);
        currentAudioRef.current = null;
        isPlaying.current = false;
        playNextAudio();
      });
    }
  };

  const handleFinishJob = () => {
    setIsEnding(true);
    router.push('/tech/queue');
  };

  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: "text", 
          text: "I have returned. Briefly summarize what we just did and tell me the exact next step." 
        }));
      }
    } else {
      setIsPaused(true);
      // Instant audio kill-switch
      audioQueue.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
        isPlaying.current = false;
      }
    }
  };

  // --- PUSH-TO-TALK ---
  // Mic audio only streams to the backend while the button is held down.
  const startTalking = () => {
    if (isPaused) return;
    // Resume the AudioContext in case the browser suspended it (mobile autoplay policy)
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    setIsHolding(true);
  };

  const stopTalking = () => {
    setIsHolding(false);
  };

  const handleManualVerify = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Temporarily set status to show it's processing the frame
      setStatus("Connecting..."); 
      
      // FORCE AN IMMEDIATE FRAME CAPTURE BEFORE ASKING THE AI TO LOOK
      captureAndSendFrame();
      
      // Inject the explicit command
      wsRef.current.send(JSON.stringify({ 
        type: "text", 
        text: "I have pressed the Verify Frame button. Please analyze the exact live video frame you just received, acknowledge what you see, and tell me the next step." 
      }));
      
      // Reset status back to online after a short delay
      setTimeout(() => setStatus("AI Online"), 1500);
    }
  };

  const handleCompleteAudit = async () => {
    setIsEnding(true);
    try {
      const supabase = createClient();
      await supabase
        .from('jobs')
        .update({ status: 'Completed' })
        .eq('id', jobId);
    } catch (e) {
      console.error('Error completing audit:', e);
    }
    router.refresh();
    router.push('/tech/queue');
  };

  return (
    <div className="w-full h-screen bg-[#0a0e1a] flex flex-col overflow-hidden text-white">
      <canvas ref={canvasRef} className="hidden" />

      {/* ============================================================
          ZONE 1 — CAMERA (full-bleed scanning tool)
      ============================================================ */}
      <div className="relative w-full h-[42%] bg-gradient-to-b from-[#0f1629] to-[#0a0e1a] overflow-hidden shrink-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* LIVE badge + job label */}
        {isCameraStarted && (
          <>
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-red-600 px-3 py-1.5 rounded-full shadow-lg">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              <span className="text-xs font-bold uppercase tracking-wider">Live</span>
            </div>
            <div className="absolute top-4 right-4 z-20 text-right">
              <p className="text-xs font-semibold text-white/90">Job #{jobId.slice(0, 4).toUpperCase()}</p>
              <p className="text-[10px] uppercase tracking-wide text-white/50">{jobType}</p>
            </div>

            {/* Scan-corner brackets */}
            <div className="pointer-events-none absolute inset-6 z-10">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/40 rounded-tl-lg"></span>
              <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/40 rounded-tr-lg"></span>
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/40 rounded-bl-lg"></span>
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/40 rounded-br-lg"></span>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20 text-xs font-medium tracking-widest uppercase">
                {status === 'AI Online' ? '' : 'Camera feed'}
              </span>
            </div>
          </>
        )}

        {/* Start Camera Overlay */}
        {!isCameraStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0e1a]/80 backdrop-blur-md z-50">
            <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse ring-1 ring-indigo-400/30">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">Ready to Inspect</h2>
            <p className="text-white/60 mb-8 text-center max-w-xs font-medium">Tap below to activate your camera and connect to ARIA.</p>
            <button
              onClick={startCameraAndAudio}
              className="touch-manipulation bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-full text-xl font-bold shadow-lg shadow-indigo-900/40 transition-all active:scale-95"
            >
              Start AI Audit
            </button>
          </div>
        )}
      </div>

      {/* ============================================================
          ZONES 2-4 — ARIA panel, transcript, actions
      ============================================================ */}
      <div className="flex-grow flex flex-col min-h-0 px-4 pt-4 pb-5 gap-3">

        {/* ZONE 2 — ARIA current message + directional cue */}
        <div className="bg-indigo-500/10 border border-indigo-400/20 rounded-2xl p-4 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${status === 'AI Online' ? 'bg-indigo-400 animate-pulse' : 'bg-white/30'}`}></span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
              ARIA {status === 'AI Online' ? '· Speaking' : '· Standby'}
            </span>
          </div>
          <p className="text-[15px] leading-snug font-medium text-white">
            {currentAriaMessage || (status === 'AI Online'
              ? 'Listening… show me the equipment and I\'ll guide you.'
              : 'Start the audit to connect with ARIA.')}
          </p>
        </div>

        {/* ZONE 3 — Conversation transcript */}
        <div className="flex-grow min-h-0 flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 px-1">Conversation</p>
          <div className="flex-grow min-h-0 overflow-y-auto space-y-2 pr-1">
            {messages.length === 0 && (
              <p className="text-white/30 text-sm text-center mt-6">The conversation will appear here.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'tech' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-snug ${
                  m.role === 'tech'
                    ? 'bg-indigo-600 text-white rounded-br-md'
                    : 'bg-white/10 text-white/90 rounded-bl-md'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* ZONE 4 — Action buttons */}
        <div className="shrink-0 flex flex-col gap-2.5">
          {/* Primary row: Hold to speak / Pause / End */}
          <div className="flex gap-2.5">
            <button
              onPointerDown={startTalking}
              onPointerUp={stopTalking}
              onPointerLeave={stopTalking}
              onPointerCancel={stopTalking}
              onContextMenu={(e) => e.preventDefault()}
              disabled={status !== 'AI Online' || isPaused}
              className={`touch-manipulation select-none flex-1 py-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                isHolding
                  ? 'bg-indigo-500 text-white ring-2 ring-indigo-300 scale-[1.02]'
                  : 'bg-white/10 text-white hover:bg-white/15'
              } ${(status !== 'AI Online' || isPaused) ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              <span className="text-xs">{isHolding ? 'Listening…' : 'Hold to speak'}</span>
            </button>

            <button
              onClick={handleTogglePause}
              className={`touch-manipulation flex-1 py-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                isPaused
                  ? 'bg-amber-500 text-white hover:bg-amber-400'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              {isPaused ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              )}
              <span className="text-xs">{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            <button
              onClick={handleFinishJob}
              disabled={isEnding}
              className={`touch-manipulation flex-1 py-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                isEnding
                  ? 'bg-red-500/40 text-white/70 cursor-not-allowed'
                  : 'bg-white/10 text-white hover:bg-red-500/20'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              <span className="text-xs">{isEnding ? 'Closing…' : 'End'}</span>
            </button>
          </div>

          {/* Secondary row: Verify Frame / Complete Audit */}
          <div className="flex gap-2.5">
            <button
              onClick={handleManualVerify}
              disabled={status !== 'AI Online'}
              className={`touch-manipulation flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 border border-indigo-400/30 text-indigo-300 hover:bg-indigo-500/10 ${
                status !== 'AI Online' ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              Verify Frame
            </button>
            <button
              onClick={handleCompleteAudit}
              disabled={isEnding}
              className={`touch-manipulation flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${
                isEnding
                  ? 'bg-emerald-500/40 text-white/70 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/30'
              }`}
            >
              {isEnding ? 'Processing…' : 'Complete Audit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}