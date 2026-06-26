# InstructAI

AI-guided auditing assistant for IT infrastructure.

## Project Overview

InstructAI is a real-time, multimodal assistant that allows IT technicians to stream live audio and video from the field to a backend powered by Google's Gemini Live API. It has transitioned into a complete Web Application (Next.js) with a FastAPI backend and Supabase for authentication and database management.

## Project Structure

- `/backend`: FastAPI backend (Python) that manages the WebSocket connection with the web app and interfaces with the Gemini Live Realtime API.
- `/web-app`: Next.js web application (React, Tailwind CSS, Supabase) for Admin dispatchers and Field Technicians.

## Prerequisites

- **Python 3.10+** (for backend)
- **Node.js 18+** (for frontend)
- **Supabase** project for database and authentication
- **Google Gemini API Key**

## How to Run

### 1. Backend (FastAPI)

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Activate the Python environment:
   - Windows: `venv\Scripts\activate`
   - Unix/macOS: `source venv/bin/activate`
3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure Environment Variables:
   Create a `.env` file in the `backend` directory with:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ```
5. Start the server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload   
   ```
   The backend will run at `http://localhost:8000` (WebSocket at `ws://localhost:8000/ws`).

### 2. Frontend (Next.js Web App)

1. Navigate to the `web-app` directory:
   ```bash
   cd web-app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment Variables:
   Create a `.env.local` file in the `web-app` directory with your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   The web app will run at `http://localhost:3000`.

### Note on Secure Contexts (HTTPS)

Because the web app requires access to `navigator.mediaDevices` (Camera and Microphone), modern browsers enforce a **Secure Context**. When testing on a separate device (like a mobile phone), you must expose both the frontend and backend over HTTPS/WSS.
- Use **ngrok** to tunnel the backend: `ngrok http 8000` (Update the Web App WebSocket URL to the ngrok `wss://` address).
- Use **Cloudflare Tunnels** or **ngrok** to tunnel the Next.js frontend (port 3000).
npx cloudflared tunnel --url http://localhost:3000 --http-host-header localhost 
