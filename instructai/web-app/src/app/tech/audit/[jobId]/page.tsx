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

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

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

      // Setup WebSocket
      let wsUrl = "wss://pretense-citable-uncut.ngrok-free.dev/ws";
      if (jobData?.job_type) {
        wsUrl += `?job_type=${encodeURIComponent(jobData.job_type)}`;
      }
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("AI Online");

        // Set up audio capture using AudioContext and AudioWorklet
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
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
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                const inputData = event.data;
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  let s = Math.max(-1, Math.min(1, inputData[i]));
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

      // ... (keep your ws.onerror and ws.onclose the same) ...

      const playNextAudio = () => {
        if (isPlaying.current || audioQueue.current.length === 0) return;

        isPlaying.current = true;
        const audio = audioQueue.current.shift();
        if (audio) {
          currentAudioRef.current = audio; // Track the current playing audio

          audio.onended = () => {
            currentAudioRef.current = null;
            isPlaying.current = false;
            playNextAudio();
          };

          audio.play().catch(e => {
            console.warn(`Audio chunk skipped: ${e.name}`);
            currentAudioRef.current = null;
            isPlaying.current = false;
            playNextAudio();
          });
        }
      };

      ws.onerror = () => setStatus("Error");
      ws.onclose = () => {
        setStatus("Disconnected");
        if (intervalIdRef.current) clearInterval(intervalIdRef.current);
      };

    } catch (err: any) {
      console.error("Error accessing media devices.", err);
      // THIS IS THE MAGIC LINE: It forces the phone to show us the error!
      alert(`🚨 CAMERA ERROR: ${err.name} - ${err.message}`);
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
      audio.onended = () => {
        isPlaying.current = false;
        playNextAudio();
      };
      // THE FIX: We catch the error quietly so Next.js ignores it.
      audio.play().catch(e => {
        console.warn(`Audio chunk skipped: ${e.name}`);
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
    <div className="w-full h-screen bg-gray-50 flex flex-col overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Section: The Camera */}
      <div className="relative w-full h-[55%] bg-black rounded-b-[40px] overflow-hidden shadow-xl shrink-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Start Camera Overlay (Frosted Glass) */}
        {!isCameraStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md z-50">
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6 animate-pulse shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
            </div>
            <h2 className="text-gray-900 text-2xl font-bold mb-2">Ready to Inspect</h2>
            <p className="text-gray-600 mb-8 text-center max-w-xs font-medium">Tap below to activate your camera and connect to the AI Auditor.</p>
            <button
              onClick={startCameraAndAudio}
              className="touch-manipulation bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-full text-xl font-bold shadow-lg transition-all active:scale-95"
            >
              Start AI Audit
            </button>
          </div>
        )}
      </div>

      {/* Bottom Section: The Control Card */}
      <div className="flex-grow bg-gray-50 flex flex-col px-6 pt-6 pb-8">
        <div className="bg-white rounded-3xl p-6 shadow-sm flex flex-col h-full justify-between">
          
          <div className="flex flex-col gap-6">
            {/* Status Header */}
            <div className="flex justify-center w-full">
              <div className={`px-4 py-2 rounded-full flex items-center border shadow-sm w-full justify-center ${
                status === 'AI Online' ? 'bg-green-50 border-green-200 text-green-700' :
                status === 'Connecting...' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                status === 'Waiting for Camera' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full mr-2.5 ${
                  status === 'AI Online' ? 'bg-green-500 animate-pulse' :
                  status === 'Connecting...' ? 'bg-yellow-500 animate-bounce' :
                  status === 'Waiting for Camera' ? 'bg-blue-500' : 'bg-red-500'
                }`}></span>
                <span className="text-sm font-bold uppercase tracking-wide">{status}</span>
              </div>
            </div>

            {/* Audio Feedback UI */}
            <div className="bg-indigo-50 rounded-2xl p-4 flex items-center justify-between border border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                </div>
                <div>
                  <p className="text-indigo-900 font-bold text-sm">AI Auditor</p>
                  <p className="text-indigo-600/80 text-xs font-medium">
                    {status === 'AI Online' ? 'Listening & Analyzing...' : 'Standby'}
                  </p>
                </div>
              </div>
              {status === 'AI Online' && (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-4 bg-indigo-400 rounded-full animate-[pulse_1s_ease-in-out_infinite]"></span>
                  <span className="w-1.5 h-6 bg-indigo-500 rounded-full animate-[pulse_1.2s_ease-in-out_infinite]"></span>
                  <span className="w-1.5 h-3 bg-indigo-400 rounded-full animate-[pulse_0.8s_ease-in-out_infinite]"></span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 mt-6">
            
            {/* MANUAL OVERRIDE BUTTON */}
            <button
              onClick={handleManualVerify}
              className="touch-manipulation w-full py-4 rounded-full font-bold shadow-lg transition-all active:scale-95 bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700"
            >
              Verify Frame
            </button>

            <button
              onClick={handleCompleteAudit}
              disabled={isEnding}
              className={`touch-manipulation w-full py-4 rounded-full font-bold shadow-lg transition-all active:scale-95 ${
                isEnding 
                  ? 'bg-green-400 text-white shadow-none opacity-75 cursor-not-allowed' 
                  : 'bg-green-600 text-white shadow-green-200 hover:bg-green-700'
              }`}
            >
              {isEnding ? 'Processing...' : 'Complete Audit'}
            </button>
            <div className="flex gap-3">
              <button 
                onClick={handleTogglePause}
                className={`touch-manipulation flex-1 py-4 rounded-full border-2 font-bold transition-colors ${
                  isPaused 
                    ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600' 
                    : 'border-indigo-100 text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                {isPaused ? 'Resume AI' : 'Pause AI'}
              </button>
              <button
                onClick={handleFinishJob}
                disabled={isEnding}
                className={`touch-manipulation flex-1 py-4 rounded-full font-bold shadow-lg transition-all active:scale-95 ${
                  isEnding 
                    ? 'bg-indigo-400 text-white shadow-none opacity-75 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700'
                }`}
              >
                {isEnding ? 'Closing...' : 'End Audit'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}