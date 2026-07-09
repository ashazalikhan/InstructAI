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
- **GitHub, Render, and Vercel accounts** (for deployment)

---

## Live Deployment (Current Setup)

The application is currently deployed and live on the internet. Code pushed to the `main` branch on GitHub automatically triggers builds on the hosting platforms.

### 1. Backend (Render)
The FastAPI backend is hosted as a Web Service on [Render](https://render.com/). 
- It handles persistent WebSocket connections.
- Requires the `GEMINI_API_KEY` environment variable in the Render dashboard.
- Starts using the command: `uvicorn main:app --host 0.0.0.0 --port 10000`

### 2. Frontend (Vercel)
The Next.js web application is hosted on [Vercel](https://vercel.com/). Vercel provides a secure `https://` context out-of-the-box, which is strictly required by modern mobile browsers to access the camera and microphone (`navigator.mediaDevices`).
- Requires Supabase credentials and the Render backend URL in the Vercel dashboard.

---

## Local Development Setup

If you are developing or testing new features locally, follow these steps:

### 1. Backend (FastAPI)

1. Navigate to the `backend` directory:
   ```bash
   cd backend

----------------------------------------------------------------------------------------------------

Activate the Python environment:

Windows: venv\Scripts\activate

Unix/macOS: source venv/bin/activate

Install requirements:

Bash
pip install -r requirements.txt
Configure Environment Variables:
Create a .env file in the backend directory with:

Code snippet
GEMINI_API_KEY=your_gemini_api_key
Start the server:

Bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload   
The backend will run at http://localhost:8000 (WebSocket at ws://localhost:8000/ws).

2. Frontend (Next.js Web App)
Navigate to the web-app directory:

Bash
cd web-app
Install dependencies:

Bash
npm install
Configure Environment Variables:
Create a .env.local file in the web-app directory with your Supabase credentials and local backend URL:

Code snippet
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:8000/ws
Start the development server:

Bash
npm run dev
The web app will run at http://localhost:3000.

Note on Secure Contexts (Mobile Testing Locally)
Because the web app requires access to navigator.mediaDevices (Camera and Microphone), modern browsers enforce a Secure Context. When testing on a separate device (like a mobile phone) without using the Vercel deployment, you must expose both the frontend and backend over HTTPS/WSS.

Use ngrok to tunnel the backend: ngrok http 8000 (Update the Web App WebSocket URL to the ngrok wss:// address).

Use Cloudflare Tunnels or ngrok to tunnel the Next.js frontend (port 3000):

Bash
npx cloudflared tunnel --url http://localhost:3000 --http-host-header localhost