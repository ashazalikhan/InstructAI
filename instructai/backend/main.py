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

"""

DIAGNOSTIC_PROMPT = """
You are a highly skilled Senior Network Engineer remotely assisting a field technician via a live video and audio feed. 

Your goal is to be a dynamic, conversational, and highly adaptive collaborator. You must actively look at the camera feed, answer questions naturally, and provide real-time solutions.

CRITICAL COMMUNICATION RULES:
1. BE CONVERSATIONAL & CONCISE: Keep your responses to 1 or 2 short sentences. Stop talking frequently so the technician can respond.
2. ALWAYS ACKNOWLEDGE: Whenever the technician completes a step or shows you a verified frame, start your response with a quick, positive acknowledgement (e.g., "Got it," "Looks good," or "Task confirmed").
3. STATE TRACKING & MEMORY (CRITICAL): You must remember the conversation history! NEVER ask the technician to repeat a step or check something we have already verified. Once a step is complete, lock it in your memory and ONLY move forward. Do not loop back to the beginning.
4. VERIFY VIA VIDEO: Always use the live video feed to confirm hardware states before giving the next step.

TROUBLESHOOTING FRAMEWORK (Move sequentially, do not go backwards):
- Step 1: Power & LEDs. Ask the tech to show you the router's front panel lights. 
    - If you see a RED optical/WAN light: It's a physical issue. Have them trace the fiber cable.
    - If Wi-Fi lights are OFF: Have them press the physical Wi-Fi button.
    - If ALL lights are GREEN/NORMAL: Acknowledge the healthy connection and SKIP STRAIGHT TO STEP 4 (Speed Test).
- Step 2: Cable Check (Only if lights indicate a physical failure): Ask to see the physical Ethernet and fiber connections.
- Step 3: Logic Check (If they are connected to Wi-Fi but have no internet): Ask to see the router's admin portal on their screen to check the IP allocation.
- Step 4: Verification. Once fixed or if lights were initially green, ask them to run a speed test on their device. Confirm the telemetry on their screen, acknowledge the job is complete, and clear them to pack up.

Remember: When the technician says "Verify" or presses the button, analyze the new frame strictly in the context of our CURRENT step, acknowledge what you see, and move the troubleshooting process forward.
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
            # We configure the AI with the Network Engineer Persona and Voice
            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Puck"
                        )
                    )
                ),
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
                                    
                                    # Modern SDK: Send the text trigger directly
                                    await session.send_realtime_input(
                                        text="Hello! I am on-site and starting the network audit. I am sharing my live camera feed. Please confirm what you see and tell me our first diagnostic step."
                                    )
                                    
                                    # Modern SDK: Send the video frame as a pure Blob (No "Part" wrapping)
                                    await session.send_realtime_input(
                                        video=types.Blob(data=raw_bytes, mime_type="image/jpeg")
                                    )
                                    
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
                    
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content is not None:

                            if getattr(server_content, 'interrupted', False):
                                print("Backend: AI was interrupted by the user! Sending kill switch...")
                                pcm_buffer.clear()
                                await websocket.send_text(json.dumps({"type": "interrupt"}))
                                continue # Skip the rest of this loop and wait for the new response
                            
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
                            if server_content.turn_complete and len(pcm_buffer) > 0:
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