// Mio — js/llm.js

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const API_KEY_STORAGE_KEY = 'mio_api_key';

/**
 * Retrieves the Groq API key from localStorage.
 * @returns {string} The API key.
 * @throws {Error} If the API key is not found.
 */
export function getApiKey() {
    const key = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!key || key.trim() === '') {
        throw new Error('API key missing');
    }
    return key.trim();
}

/**
 * Saves the Groq API key to localStorage.
 * @param {string} key - The API key to save.
 */
export function setApiKey(key) {
    if (key && typeof key === 'string') {
        localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
}

/**
 * Checks if the API key exists in localStorage and is not empty.
 * @returns {Promise<boolean>} True if key exists, false otherwise.
 */
export async function checkApiKey() {
    try {
        const key = localStorage.getItem(API_KEY_STORAGE_KEY);
        return !!(key && key.trim() !== '');
    } catch {
        return false;
    }
}

/**
 * Sends a chat history to Groq's chat completion endpoint.
 * @param {Array<Object>} messages - Array of message objects: {role, content}.
 * @param {Object} [options] - Optional settings.
 * @param {number} [options.temperature=0.7] - The creativity temperature.
 * @param {number} [options.maxTokens=300] - Maximum response tokens.
 * @param {string|null} [options.model=null] - The model identifier to use.
 * @returns {Promise<string>} The assistant's text response.
 * @throws {Error} On API failures or network problems.
 */
export async function chat(messages, options = {}) {
    const apiKey = getApiKey();
    const {
        temperature = 0.7,
        maxTokens = 300,
        model = 'openai/gpt-oss-120b'
    } = options;

    const runChat = async (selectedModel) => {
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
            throw new Error('No choices returned from chat completion API');
        }

        return data.choices[0].message.content;
    };

    try {
        return await runChat(model);
    } catch (error) {
        if (model === 'openai/gpt-oss-120b') {
            try {
                return await runChat('openai/gpt-oss-20b');
            } catch (fallbackError) {
                throw new Error(`Chat failed on primary and fallback models: ${fallbackError.message}`);
            }
        }
        throw error;
    }
}

/**
 * Transcribes audio blob to text using Groq's Whisper API.
 * @param {Blob} audioBlob - The recorded audio blob.
 * @returns {Promise<string>} The transcription text.
 * @throws {Error} On API failures or network problems.
 */
export async function transcribe(audioBlob) {
    const apiKey = getApiKey();
    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'hi');
    formData.append('response_format', 'json');

    try {
        const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Transcription error ${response.status}`);
        }

        const data = await response.json();
        return data.text || '';
    } catch (error) {
        throw new Error(`Transcription request failed: ${error.message}`);
    }
}
