# 🐰 Bunny AI — Your Personal Assistant

[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B-brightgreen.svg)](https://nodejs.org/)
[![OpenAI API](https://img.shields.io/badge/OpenAI-Responses%20API-ff2a55.svg)](https://platform.openai.com/docs)
[![Model](https://img.shields.io/badge/Default%20Model-GPT--6%20Luna-ff4770.svg)](https://platform.openai.com/)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Bunny AI** is a state-of-the-art, full-stack personal AI assistant featuring a distinctive **red-and-black cybernetic aesthetic**, powered by the official **OpenAI JavaScript/TypeScript SDK** and **Responses API**, with **Whisper voice interaction**, **TTS-1 speech synthesis**, and **Supabase PostgreSQL cloud persistence**.

---

## 🌟 Key Highlights & Features

### 1. 🎨 Official Brand Identity & Visual Aesthetic
- **Brand Identity**: Application name: **Bunny**, Assistant name: **Bunny AI**, Browser Title: **Bunny AI — Your Personal Assistant**.
- **Original Logo**: Custom-designed, cybernetic vector Bunny AI emblem with glowing crimson neon visor and faceted geometric ears.
- **Visual Design**: Premium red-and-black theme (`#ff2a55` Bunny Crimson Neon on deep `#08080a` Obsidian) with smooth glassmorphism surfaces and dynamic micro-animations.

### 2. 🎬 Premium Startup Animation
- **Cybernetic Intro Sequence**: Smooth 3D logo perspective rotation with dual concentric pulsing rings.
- **Ambient Lighting Effects**: Radial crimson aura with luminous progress bar and status feedback.
- **Fast & Accessible**: Short startup sequence (under 1.5s), can be skipped immediately by clicking anywhere, and honors `@media (prefers-reduced-motion: reduce)` for users with motion sensitivities.

### 3. 🧠 Official OpenAI Integration (Responses API)
- **Centralized AI Service** (`backend/services/ai.js`): All OpenAI SDK calls, error classifications, retry logic, and audio models are housed in one isolated server-side service.
- **Responses API**: Uses the currently supported modern Responses API (`client.responses.create({ model, instructions, input, stream })`) for both standard and real-time streaming completions.
- **Primary Model**: Configured through `OPENAI_MODEL` environment variable (defaults to `gpt-6-luna`).
- **Verified Fallback Model**: Configured through `OPENAI_FALLBACK_MODEL` (e.g. `gpt-4o-mini`) to seamlessly recover if the primary model is unavailable on the account.

### 4. 🛡️ Robust Model Verification & Error Classification
- **Live Model Verification** (`POST /api/model/verify`): Executes a real API probe before use to confirm whether credentials and model access actually work.
- **Precise Error Categorization**:
  - `AUTH_INVALID_KEY` (401): Actionable guidance to check API key in `backend/.env`.
  - `QUOTA_EXCEEDED` (429): Clear explanation that billing/usage limits have been reached.
  - `RATE_LIMITED` (429): Backoff indicator with retry timing.
  - `MODEL_UNAVAILABLE` (404): Detects account model restrictions and triggers verified fallback.
  - `NETWORK_TIMEOUT` (408): Safe transient retries with exponential backoff (NEVER retries invalid keys or quota limits).
- **Safe Diagnostic Logging**: Masks all secret credentials (e.g. `sk-proj...7a9f`) in server logs.

### 5. 🎙️ Bunny Voice Assistant Mode
- **Interactive Voice Modal**: Fullscreen/floating cyber-visualizer with dynamic red pulsing orb.
- **Original Status Labels**:
  - `Talk to Bunny` (Idle state)
  - `Bunny is listening...` (Active audio recording)
  - `Bunny is thinking...` (API query & neural synthesis)
  - `Bunny is speaking...` (Spoken voice playback)
- **Speech-to-Text (STT)**: Captures user microphone audio via MediaRecorder and transcribes with OpenAI Whisper (`whisper-1`), with instant fallback to browser Web Speech API.
- **Text-to-Speech (TTS)**: Synthesizes responses using OpenAI TTS-1 (`nova` voice), with fallback to browser SpeechSynthesis.
- **Audio Controls**: Play, pause, immediate stop/interrupt, mute toggle, and replay last spoken answer.
- **Synchronized Chat**: Spoken queries and AI spoken answers are automatically synchronized into the text conversation history and persisted to Supabase!

### 6. 💬 Conversational Experience
- **New Conversation**: Start a fresh conversation instantly (`+ New Chat` or `Ctrl/Cmd + N`).
- **History Management**: Rename conversations (`PATCH /api/conversations/:id`) and delete sessions (`DELETE /api/conversations/:id`).
- **Animated Typing Indicator**: Custom three-dot pulsing crimson wave with `"Bunny is thinking..."`.
- **Response Actions**: One-click **Copy response**, **Regenerate response**, and **Spoken audio playback**.
- **Stop Generation**: Real-time abort controller button immediately terminates in-flight streams.
- **Smart Auto-Scroll**: Does not interrupt the user if they scroll up to inspect older messages.
- **Markdown & Code Highlighting**: Full Markdown support (tables, lists, blockquotes) and code blocks with syntax highlighting and copy buttons.

### 7. ⚡ Supabase Cloud Sync & Offline Local Fallback
- **Database Persistence**: Automatic session storage in Supabase PostgreSQL (`conversations` and `messages` tables).
- **Offline Resilient**: If Supabase credentials are not configured or tables are not yet initialized, Bunny AI automatically falls back to browser LocalStorage without interruption.

---

## 📁 Repository Architecture

```
bunny-ai-assistant/
├── backend/
│   ├── .env.example              # Safe environment template (NO secrets)
│   ├── .env                      # Local server configuration (Ignored by Git)
│   ├── package.json              # Backend dependencies (openai, @supabase/supabase-js, express)
│   ├── server.js                 # Express server & static asset host
│   ├── supabase_schema.sql       # SQL migration schema for Supabase
│   ├── routes/
│   │   ├── chat.js               # OpenAI chat routes (/api/chat, /api/chat/stream, /api/model/verify)
│   │   ├── conversations.js      # Supabase routes (/api/conversations, /api/supabase/status)
│   │   └── voice.js              # Audio routes (/api/voice/transcribe, /api/voice/speak, /api/voice/status)
│   ├── services/
│   │   ├── ai.js                 # Centralized OpenAI AI service (Responses API, Whisper, TTS, retries)
│   │   └── supabase.js           # Supabase client service & query methods
│   └── scripts/
│       └── migrate.js            # Automated CLI database migration script
│
├── frontend/
│   ├── .env.example              # Public frontend environment template
│   ├── .env                      # Public client config (Ignored by Git)
│   ├── index.html                # Semantic HTML5, startup screen, voice modal, input dock
│   ├── style.css                 # Red & Black cyber design system, micro-animations, responsive layout
│   ├── app.js                    # Frontend controller, streaming handler, voice state machine
│   ├── bunny-logo.svg            # Official vector SVG Bunny AI emblem
│   └── server.js                 # Lightweight static asset HTTP server
│
├── supabase/
│   └── migrations/
│       └── 20261014000000_create_chat_tables.sql # Supabase CLI migration
│
├── .gitignore                    # Strictly excludes .env, node_modules, keys, and build files
├── package.json                  # Root convenience scripts & metadata
├── start.bat / start.sh          # Quick launch scripts for Windows and Linux/macOS
└── README.md                     # Comprehensive project documentation
```

---

## 🔑 Environment Configuration

### Backend Configuration (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Fill in your configuration:

```env
# ------------------------------------------------------------------------------
# 1. OpenAI API Credentials
# Obtain your API key at: https://platform.openai.com/api-keys
# ------------------------------------------------------------------------------
OPENAI_API_KEY=sk-proj-your_actual_api_key_here

# Primary text generation model (default: gpt-6-luna)
OPENAI_MODEL=gpt-6-luna

# Verified fallback model if primary model is unavailable on account
OPENAI_FALLBACK_MODEL=gpt-4o-mini

# Audio Configuration (Whisper STT & TTS-1)
OPENAI_STT_MODEL=whisper-1
OPENAI_TTS_MODEL=tts-1
OPENAI_TTS_VOICE=nova

# ------------------------------------------------------------------------------
# 2. Server Port
# ------------------------------------------------------------------------------
PORT=5000

# ------------------------------------------------------------------------------
# 3. Supabase Cloud Database (Optional for cloud sync)
# Obtain from: https://supabase.com/dashboard/project/_/settings/api
# ------------------------------------------------------------------------------
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

> **Security Note**: Never expose `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to frontend client code. The server keeps all secrets protected and exposes only safe public metadata via `/api/config`.

---

## ⚡ Supabase Setup (Database Schema)

To enable database persistence for chat history across devices:

### Option A: Using the Supabase Web Dashboard (Recommended)
1. Open your project on the [Supabase Dashboard](https://supabase.com/dashboard).
2. Click the **SQL Editor** tab on the left navigation bar.
3. Open [`backend/supabase_schema.sql`](file:///c:/Users/AVINASH/OneDrive/Desktop/New%20folder/backend/supabase_schema.sql), copy its contents, and paste into the SQL Editor.
4. Click **Run**.

### Option B: Automated CLI Migration Script
Run the built-in migration script:
```bash
npm run migrate
```
Enter your Supabase database password when prompted. The script automatically connects over SSL, creates the tables, applies Row Level Security (RLS), and sets up performance indexes.

---

## 🚀 Quick Start & Local Development

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher)
- **OpenAI API Key** ([platform.openai.com](https://platform.openai.com/api-keys))
- *(Optional)* **Supabase Account** ([supabase.com](https://supabase.com))

### 2. Install Dependencies
```bash
npm run install:backend
```

### 3. Start the Server
From the project root:
```bash
# Windows
.\start.bat

# Linux / macOS
./start.sh
```

Or using npm:
```bash
npm start
```

Open your browser to:
- **Web Application**: [http://localhost:5000](http://localhost:5000) (Unified full-stack server) or [http://localhost:3000](http://localhost:3000) (Standalone frontend server).

---

## 🧪 Testing & Verification

Run the automated syntax and module validation checks:
```bash
npm test
```

### Live Diagnostic Endpoints
- **Health Check**: `GET http://localhost:5000/api/health`
- **Safe Public Config**: `GET http://localhost:5000/api/config`
- **Supported Models**: `GET http://localhost:5000/api/models`
- **Audio Service Status**: `GET http://localhost:5000/api/voice/status`
- **Model Probe**: `POST http://localhost:5000/api/model/verify`

---

## 💰 Student Project Cost Control & Security Guidelines

- **Token Economy**: The default text model `gpt-6-luna` is engineered for ultra-fast, high-volume, cost-efficient workloads (~$0.10 / 1M input tokens).
- **Output Token Caps**: Built-in `max_output_tokens: 2048` limits on server-side requests prevent accidental infinite generation.
- **Rate Limiting**: Built-in sliding window rate limiter (max 30 requests/minute per IP) protects against accidental loop queries.
- **Voice Usage**: Voice transcription (Whisper) and speech synthesis (TTS-1) make separate calls only when voice mode is actively used. When disabled or unconfigured, the application gracefully falls back to browser-native Web Speech recognition and speech synthesis at zero cost.
- **Notice on Subscriptions**: Having a ChatGPT Plus or Pro subscription **does not** include OpenAI API credits. OpenAI API usage is billed separately via platform credits.

---

## 🚢 Production Deployment

Bunny AI is designed as a production-grade full-stack Node.js Express application that serves both its backend API and optimized frontend static assets.

### Recommended Platform: Render / Railway / Fly.io

#### Step 1: Push Repository to GitHub
```bash
git init
git add .
git commit -m "feat: complete Bunny AI build with OpenAI Responses API and voice assistant"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bunny-ai-assistant.git
git push -u origin main
```

#### Step 2: Deploy on Render (Web Service)
1. Log in to [Render](https://render.com/) and click **New + > Web Service**.
2. Connect your `bunny-ai-assistant` repository.
3. Configure settings:
   - **Environment**: Node
   - **Build Command**: `npm run install:backend`
   - **Start Command**: `npm start`
4. In the **Environment Variables** tab, add your secrets:
   - `OPENAI_API_KEY`: `sk-proj-...`
   - `OPENAI_MODEL`: `gpt-6-luna`
   - `OPENAI_FALLBACK_MODEL`: `gpt-4o-mini`
   - `SUPABASE_URL`: `https://your-project.supabase.co`
   - `SUPABASE_ANON_KEY`: `eyJ...`
   - `SUPABASE_SERVICE_ROLE_KEY`: `eyJ...`
   - `PORT`: `5000` (or leave default assigned by host)
5. Click **Deploy Web Service**.

#### Step 3: Post-Deployment Verification
Once deployed:
1. Navigate to `https://your-app-url.onrender.com/api/health` to confirm the service reports `status: "online"`.
2. Visit `https://your-app-url.onrender.com/` in your browser to experience Bunny AI live!

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
