import wave
import io 
import os
import json
import base64
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Load environment variables
load_dotenv()

app = FastAPI(title="InstructAI Backend")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# GEMINI AI SYSTEM PROMPTS
# ==========================================

SETUP_PROMPT = """
You are ARIA, an expert IT field-setup assistant on a live audio/video call with a technician installing new equipment.

RULES:
- Give ONE clear instruction or ask ONE question per turn — never more.
- Always reference what you can actually see in the frame: "I can see the power LED is solid green."
- Build on previous turns — never repeat a step that's already done.
- Keep every response under 35 words. The technician is busy and wearing an earpiece.
- If the technician speaks, acknowledge it first ("Got it," "Looks good") before continuing.
- End every response with one clear next action: "Now connect the WAN cable to the blue port."

SETUP FLOW (move forward, never loop back):
1. Confirm the device is powered and the boot LEDs are normal.
2. Guide the physical cabling (WAN/fiber in, LAN out) one cable at a time.
3. Walk through the admin portal / app activation on their screen.
4. Verify connectivity with a speed test, confirm success, and clear them to finish.

Do NOT give generic advice. Every response must be grounded in the current frame.
"""

DIAGNOSTIC_PROMPT = """
You are ARIA, an expert IT diagnostic assistant on a live audio/video call with a field technician. You are LEADING a structured fault-finding session — you drive the conversation, the technician follows.

RULES:
- Ask ONE question or give ONE instruction per turn — never more.
- Always reference what you can actually see in the frame: "I can see the WAN LED is off."
- Build on previous turns — never repeat yourself and never re-check a step we already verified.
- Distinguish what you SEE vs what you SUSPECT vs what you need CONFIRMED.
- Keep every response under 35 words. The technician is busy and wearing an earpiece.
- If the technician speaks, acknowledge it first ("Got it," "Looks good") before continuing.
- End every response with one clear next action: "Can you tilt the camera toward the back panel?"

TROUBLESHOOTING FLOW (move forward sequentially, never loop back):
1. Power & LEDs: have the tech show the router's front panel.
   - RED optical/WAN light → physical fiber issue; have them trace the fiber cable.
   - Wi-Fi lights OFF → have them press the physical Wi-Fi button.
   - ALL lights GREEN → acknowledge the healthy link and skip straight to step 4.
2. Cable check (only if LEDs show a physical failure): inspect the Ethernet and fiber connections.
3. Logic check (connected but no internet): view the router admin portal to check IP allocation.
4. Verify: run a speed test, confirm the result on screen, then clear them to pack up.

Do NOT give generic advice. Every response must be grounded in the current frame.
When the technician says "Verify" or presses the button, analyze the new frame in the context of the CURRENT step only, acknowledge what you see, and move forward.
"""

WAKE_UP_PROMPT = """
You are now connected to a live technician on-site, and their camera feed is streaming to you.
Briefly introduce yourself as ARIA in one sentence, confirm what equipment you can actually see in the frame, and ask your FIRST focused diagnostic question based on what you observe.
Keep it under 35 words.
"""

# Initialize Gemini Client
api_key = os.getenv("GEMINI_API_KEY")
client = None
if api_key and api_key != "your_gemini_api_key_here":
    client = genai.Client(api_key=api_key)

@app.get("/")
def read_root():
    return {
        "status": "InstructAI Backend is running", 
        "genai_client_initialized": client is not None
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, client_id: str = None, job_type: str = "Setup"):
    await websocket.accept()
    print(f"Backend: iPhone connected. Job Type: {job_type}")
    
    active_prompt = SETUP_PROMPT if job_type == "Setup" else DIAGNOSTIC_PROMPT
    
    if not client:
        await websocket.send_text(json.dumps({
            "type": "error", 
            "text": "Gemini client not initialized. Check API key."
        }))
        await websocket.close()
        return

    # THE INFINITE LOOP: Keeps the server alive even if Gemini drops
    while True:
        try:
            # We configure the AI with the Network Engineer Persona and Voice.
            # Transcription is enabled for BOTH sides so the frontend can render
            # a live conversation transcript alongside the audio.
            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Puck"
                        )
                    )
                ),
                output_audio_transcription=types.AudioTranscriptionConfig(),
                input_audio_transcription=types.AudioTranscriptionConfig(),
                system_instruction=types.Content(
                    parts=[types.Part.from_text(text=active_prompt)]
                )
            )
    
            print("Backend: Dialing Gemini...")
            async with client.aio.live.connect(model="gemini-3.1-flash-live-preview", config=config) as session:
                print("Backend: Connected to Gemini Live! Waiting for first image frame...")
                
                first_frame_received = False
                
                async def receive_from_phone():
                    nonlocal first_frame_received
                    try:
                        while True:
                            message = await websocket.receive()
                            
                            if "bytes" in message and message["bytes"]:
                                raw_bytes = message["bytes"]
                                
                                if not first_frame_received:
                                    print("Backend: First frame received! Sending wake-up prompt + image...")
                                    
                                    # Send the video frame FIRST so ARIA has something to look at
                                    # when it processes the wake-up instruction (No "Part" wrapping).
                                    await session.send_realtime_input(
                                        video=types.Blob(data=raw_bytes, mime_type="image/jpeg")
                                    )
                                    
                                    # Then trigger ARIA to introduce itself and lead the first step
                                    await session.send_realtime_input(text=WAKE_UP_PROMPT)
                                    
                                    first_frame_received = True
                                else:
                                    # Continuous frames sent natively
                                    await session.send_realtime_input(
                                        video=types.Blob(data=raw_bytes, mime_type="image/jpeg")
                                    )
                                    
                            elif "text" in message and message["text"]:
                                data = message["text"]
                                try:
                                    json_msg = json.loads(data)
                                    if isinstance(json_msg, dict):
                                        msg_type = json_msg.get("type")
                                        
                                        if msg_type == "text":
                                            text_content = json_msg.get("text", "")
                                            if text_content:
                                                print(f"Backend: Received text command: {text_content}")
                                                # Modern SDK text sending
                                                await session.send_realtime_input(text=text_content)
                                                
                                        elif msg_type == "audio":
                                            audio_b64 = json_msg["data"]
                                            raw_payload = {
                                                "realtime_input": {
                                                    "audio": {
                                                        "mime_type": "audio/pcm;rate=16000",
                                                        "data": audio_b64
                                                    }
                                                }
                                            }
                                            json_payload = json.dumps(raw_payload)
                                            if hasattr(session, '_ws'):
                                                await session._ws.send(json_payload)
                                            elif hasattr(session, '_websocket'):
                                                await session._websocket.send(json_payload)
                                except json.JSONDecodeError:
                                    print("Error: Received invalid JSON.")
                    
                    # --- CRASH PROTECTION ---
                    except WebSocketDisconnect:
                        print("Backend: iPhone connection closed normally.")
                    except Exception as e:
                        print(f"Backend: Error receiving from phone: {e}")

                async def receive_from_google():
                    pcm_buffer = bytearray() 
                    aria_transcript = ""   # ARIA's spoken words (output transcription)
                    tech_transcript = ""   # Technician's spoken words (input transcription)
                    
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content is not None:

                            if getattr(server_content, 'interrupted', False):
                                print("Backend: AI was interrupted by the user! Sending kill switch...")
                                pcm_buffer.clear()
                                aria_transcript = ""
                                await websocket.send_text(json.dumps({"type": "interrupt"}))
                                continue # Skip the rest of this loop and wait for the new response

                            # Accumulate live transcripts (they arrive in small fragments)
                            input_tx = getattr(server_content, 'input_transcription', None)
                            if input_tx is not None and getattr(input_tx, 'text', None):
                                tech_transcript += input_tx.text
                            output_tx = getattr(server_content, 'output_transcription', None)
                            if output_tx is not None and getattr(output_tx, 'text', None):
                                aria_transcript += output_tx.text
                            
                            # Catch audio as it comes in
                            model_turn = server_content.model_turn
                            if model_turn is not None:
                                for part in model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        pcm_buffer.extend(part.inline_data.data)
                                        
                                        # Send chunks if it's a really long sentence (48,000 bytes)
                                        if len(pcm_buffer) >= 48000:
                                            wav_io = io.BytesIO()
                                            with wave.open(wav_io, 'wb') as wav_file:
                                                wav_file.setnchannels(1)       
                                                wav_file.setsampwidth(2)       
                                                wav_file.setframerate(24000)   
                                                wav_file.writeframes(pcm_buffer)
                                            
                                            wav_data = wav_io.getvalue()
                                            base64_audio = base64.b64encode(wav_data).decode("utf-8")
                                            
                                            await websocket.send_text(json.dumps({
                                                "type": "audio",
                                                "data": base64_audio
                                            }))
                                            pcm_buffer.clear()

                            # THE FLUSH COMMAND: If AI is done talking, send whatever is left in the bucket!
                            if server_content.turn_complete:
                                if len(pcm_buffer) > 0:
                                    print("Backend: AI finished sentence. Flushing remaining audio to phone...")
                                    wav_io = io.BytesIO()
                                    with wave.open(wav_io, 'wb') as wav_file:
                                        wav_file.setnchannels(1)
                                        wav_file.setsampwidth(2)
                                        wav_file.setframerate(24000)
                                        wav_file.writeframes(pcm_buffer)
                                        
                                    wav_data = wav_io.getvalue()
                                    base64_audio = base64.b64encode(wav_data).decode("utf-8")
                                    
                                    await websocket.send_text(json.dumps({
                                        "type": "audio",
                                        "data": base64_audio
                                    }))
                                    pcm_buffer.clear()

                                # Flush the completed transcripts for this turn.
                                # Technician first (what they said), then ARIA's reply.
                                if tech_transcript.strip():
                                    await websocket.send_text(json.dumps({
                                        "type": "transcript",
                                        "role": "tech",
                                        "text": tech_transcript.strip()
                                    }))
                                    tech_transcript = ""
                                if aria_transcript.strip():
                                    await websocket.send_text(json.dumps({
                                        "type": "transcript",
                                        "role": "aria",
                                        "text": aria_transcript.strip()
                                    }))
                                    aria_transcript = ""

                task_a = asyncio.create_task(receive_from_phone())
                task_b = asyncio.create_task(receive_from_google())

                done, pending = await asyncio.wait(
                    [task_a, task_b],
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                for task in pending:
                    task.cancel()

        except WebSocketDisconnect:
            print("Backend: iPhone disconnected. Ending session.")
            break
        except Exception as e:
            print(f"Backend: Gemini Session error or timeout: {e}. Reconnecting in 1 second...")
            await asyncio.sleep(1)