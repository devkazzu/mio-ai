# Mio 🎙️
> Your personal AI voice assistant. Hinglish mein baat karo.

Mio ek browser-based voice assistant hai jo Hinglish mein baat karti hai — 
warm, witty, aur situational. Koi backend nahi, koi server nahi, sab kuch 
local aur free.

![Mio](docs/demo.gif)

## Features
- 🎤 Voice input — hold to talk
- 🧠 Powered by Groq (Whisper + gpt-oss)
- 💬 Natural Hinglish replies
- 🗂️ Remembers conversation + user facts
- ⏰ Reminders, timers, search
- 🔒 API key stored locally — kabhi server pe nahi jaata
- 📱 PWA — phone mein app ki tarah install karo
- 🌐 100% free (Groq free tier)

## Quick Start

1. **Groq API key lo** — [console.groq.com](https://console.groq.com)
2. **Open karo** — GitHub Pages link kholo
3. **Settings** gear pe tap karo
4. **API key paste** karo
5. **Mic button hold** karke baat karo

## Deploy on GitHub Pages

1. Repo → **Settings → Pages**
2. Source: **Deploy from branch** → `main` → `/ (root)`
3. Save
4. 1 minute baad link aa jayega: `https://yourname.github.io/mio/`

## Project Structure
mio/
├── index.html
├── manifest.json
├── sw.js
├── css/
│ └── style.css
├── js/
│ ├── app.js ← Main orchestrator
│ ├── prompts.js ← Mio's personality
│ ├── llm.js ← Groq API calls
│ ├── voice.js ← Mic + TTS
│ ├── memory.js ← History + facts
│ └── tools.js ← Reminders, timers
├── icons/ ← App icons
├── README.md
└── LICENSE


## Tech Stack

- **Voice → Text:** Groq Whisper (whisper-large-v3-turbo)
- **Brain:** Groq LLM (openai/gpt-oss-120b)
- **Text → Voice:** Web Speech API
- **Storage:** localStorage (IndexedDB later)
- **Frontend:** Vanilla HTML/CSS/JS
- **Host:** GitHub Pages

## Privacy

- API key localStorage mein rehti hai
- Conversations localStorage mein rehti hain
- Kuch bhi kisi server pe nahi jaata — sirf Groq API ko direct calls
- Koi analytics, koi tracking nahi

## License

MIT
