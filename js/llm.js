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
} catch {
return false;
}
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
messages: messages,
temperature: temperature,
max_tokens: maxTokens
})
});

if (!response.ok) {
const errorData = await response.json().catch(() => ({}));
throw new Error(errorData.error?.message || `API error ${response.status}`);
}

const data = await response.json();
if (!data.choices || data.choices.length === 0) {
throw new Error('No choices returned');
}
return data.choices[0].message.content || '';
}

try {
return await runChat(model);
} catch (error) {
if (model === 'openai/gpt-oss-120b') {
try {
return await runChat('openai/gpt-oss-20b');
} catch (fallbackError) {
throw new Error(`Chat failed: ${fallbackError.message}`);
}
}
throw error;
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
const errorData = await response.json().catch(() => ({}));
throw new Error(errorData.error?.message || `Transcription error ${response.status}`);
}

const data = await response.json();
return data.text || '';
}
