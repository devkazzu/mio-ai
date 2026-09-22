// Mio — js/voice.js

import { transcribe } from './llm.js';

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let recording = false;

/**
 * Checks if the browser supports MediaRecorder and getUserMedia APIs.
 * @returns {Promise<{supported: boolean, reason?: string}>} Support status.
 */
export async function initVoice() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        return { supported: false, reason: 'getUserMedia is not supported in this browser' };
    }
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
        return { supported: false, reason: 'MediaRecorder is not supported in this browser' };
    }
    if (typeof window.speechSynthesis === 'undefined') {
        return { supported: false, reason: 'speechSynthesis is not supported in this browser' };
    }
    return { supported: true };
}

/**
 * Picks the best supported audio MIME type for recording.
 * @returns {string} The selected MIME type or empty string.
 */
function pickMimeType() {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
    ];
    for (const type of candidates) {
        if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

/**
 * Requests microphone access and begins recording audio.
 * @returns {Promise<void>} Resolves once recording has started.
 * @throws {Error} If mic permission is denied or recorder cannot start.
 */
export async function startRecording() {
    if (recording) {
        return;
    }
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
    } catch (error) {
        throw new Error('Mic permission denied');
    }

    audioChunks = [];
    const mimeType = pickMimeType();

    try {
        mediaRecorder = mimeType
            ? new MediaRecorder(mediaStream, { mimeType })
            : new MediaRecorder(mediaStream);
    } catch (error) {
        cleanupStream();
        throw new Error(`Could not start recorder: ${error.message}`);
    }

    mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
            audioChunks.push(event.data);
        }
    });

    mediaRecorder.start();
    recording = true;
}

/**
 * Stops the ongoing recording and returns the audio blob.
 * @returns {Promise<Blob>} The captured audio as a Blob.
 */
export async function stopRecording() {
    if (!mediaRecorder || !recording) {
        cleanupStream();
        return new Blob([], { type: 'audio/webm' });
    }

    const recorder = mediaRecorder;
    const mimeType = recorder.mimeType || 'audio/webm';

    const blob = await new Promise((resolve) => {
        recorder.addEventListener('stop', () => {
            const finalBlob = new Blob(audioChunks, { type: mimeType });
            resolve(finalBlob);
        }, { once: true });

        try {
            recorder.stop();
        } catch {
            resolve(new Blob(audioChunks, { type: mimeType }));
        }
    });

    recording = false;
    mediaRecorder = null;
    cleanupStream();
    return blob;
}

/**
 * Stops and releases the active microphone stream.
 */
function cleanupStream() {
    if (mediaStream) {
        mediaStream.getTracks().forEach((track) => {
            try { track.stop(); } catch { /* noop */ }
        });
        mediaStream = null;
    }
    audioChunks = [];
}

/**
 * Returns the list of speech synthesis voices, waiting if not yet loaded.
 * @returns {Promise<SpeechSynthesisVoice[]>} Available voices.
 */
function getVoices() {
    return new Promise((resolve) => {
        const existing = window.speechSynthesis.getVoices();
        if (existing && existing.length > 0) {
            resolve(existing);
            return;
        }
        let resolved = false;
        const handler = () => {
            if (resolved) return;
            resolved = true;
            resolve(window.speechSynthesis.getVoices() || []);
        };
        window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            resolve(window.speechSynthesis.getVoices() || []);
        }, 1000);
    });
}

/**
 * Chooses the best female-sounding voice available.
 * @param {SpeechSynthesisVoice[]} voices - Available voices list.
 * @returns {SpeechSynthesisVoice|null} Best matching voice.
 */
function pickFemaleVoice(voices) {
    if (!voices || voices.length === 0) return null;

    const preferredNames = [
        'google uk english female',
        'samantha',
        'zira',
        'heera',
        'lekha',
        'veena',
        'kalpana',
        'female',
        'woman'
    ];
    const preferredLangs = ['hi-in', 'en-in', 'en-us', 'en-gb', 'en'];

    const normalized = voices.map((v) => ({
        voice: v,
        name: (v.name || '').toLowerCase(),
        lang: (v.lang || '').toLowerCase()
    }));

    for (const lang of preferredLangs) {
        for (const nameHint of preferredNames) {
            const match = normalized.find((v) => v.lang.startsWith(lang) && v.name.includes(nameHint));
            if (match) return match.voice;
        }
    }

    for (const nameHint of preferredNames) {
        const match = normalized.find((v) => v.name.includes(nameHint));
        if (match) return match.voice;
    }

    for (const lang of preferredLangs) {
        const match = normalized.find((v) => v.lang.startsWith(lang));
        if (match) return match.voice;
    }

    return voices[0] || null;
}

/**
 * Speaks the provided text using the Web Speech API with a female voice.
 * @param {string} text - Text to speak aloud.
 * @returns {Promise<void>} Resolves when speech finishes or errors.
 */
export async function speak(text) {
    if (!text || typeof text !== 'string') return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    stopSpeaking();

    const voices = await getVoices();
    const chosen = pickFemaleVoice(voices);

    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        if (chosen) {
            utterance.voice = chosen;
            utterance.lang = chosen.lang || 'hi-IN';
        } else {
            utterance.lang = 'hi-IN';
        }
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        utterance.volume = 1.0;

        utterance.addEventListener('end', () => resolve(), { once: true });
        utterance.addEventListener('error', () => resolve(), { once: true });

        try {
            window.speechSynthesis.speak(utterance);
        } catch {
            resolve();
        }
    });
}

/**
 * Immediately stops any ongoing speech synthesis.
 */
export function stopSpeaking() {
    try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    } catch {
        /* noop */
    }
}

/**
 * Reports whether the microphone is currently recording.
 * @returns {boolean} True if recording is active.
 */
export function isRecording() {
    return recording;
}
