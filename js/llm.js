// Mio — js/llm.js

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const API_KEY_STORAGE_KEY = 'mio_api_key';

export function getApiKey() {
    const key = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!key || key.trim() === '') throw new Error('API key missing');
    return key.trim();
}

export function setApiKey(key) {
    if (key && typeof key === 'string') {
        localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
}

export async function checkApiKey() {
    try {
        const key = localStorage.getItem(API_KEY_STORAGE_KEY);
        return !!(key && key.trim() !== '');
    } catch { return false; }
}

export async function chat(messages, options = {}) {
    const apiKey = getApiKey();
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 300;
    const model = options.model || 'openai/gpt-oss-120b';

    async function runChat(selectedModel) {
        const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages,
                temperature,
                max_tokens: maxTokens
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `API error ${response.status}`);
        }
        const data = await response.json();
        if (!data.choices || !data.choices.length) throw new Error('No choices');
        return data.choices[0].message.content || '';
    }

    try {
        return await runChat(model);
    } catch (e) {
        if (model === 'openai/gpt-oss-120b') {
            try { return await runChat('openai/gpt-oss-20b'); }
            catch (e2) { throw new Error(`Chat failed: ${e2.message}`); }
        }
        throw e;
    }
}

export async function transcribe(audioBlob) {
    const apiKey = getApiKey();
    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'hi');
    formData.append('response_format', 'json');

    const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Transcription error ${response.status}`);
    }
    const data = await response.json();
    return data.text || '';
}

// ===== VISION (photo → text description) =====
const VISION_MODELS = [
    'qwen/qwen3.8-27b'
];

export async function visionChat(imageBlob, prompt) {
    const apiKey = getApiKey();

    // Convert blob to base64 data URL
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
    });

    const userPrompt = prompt || 'Is photo mein kya dikh raha hai? Short mein Hinglish mein batao.';

    for (const model of VISION_MODELS) {
        try {
            const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: userPrompt },
                                { type: 'image_url', image_url: { url: base64 } }
                            ]
                        }
                    ],
                    temperature: 0.5,
                    max_tokens: 300
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                const msg = err.error?.message || `Error ${response.status}`;
                // If model not found, try next
                if (response.status === 404 || msg.includes('does not exist') || msg.includes('not found')) {
                    continue;
                }
                throw new Error(msg);
            }

            const data = await response.json();
            return data.choices[0].message.content || '';
        } catch (e) {
            // try next model
            continue;
        }
    }
    throw new Error('Koi bhi vision model kaam nahi kar raha. Groq console pe check karo.');
}
