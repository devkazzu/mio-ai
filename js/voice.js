// Mio — js/voice.js

let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;

export async function initVoice() {
const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
if (!hasMediaRecorder || !hasGetUserMedia) {
return { supported: false, reason: 'MediaRecorder not supported' };
}
return { supported: true };
}

export async function startRecording() {
try {
mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (e) {
throw new Error('Mic permission denied');
}

audioChunks = [];
const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
? 'audio/webm;codecs=opus'
: 'audio/webm';

mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

mediaRecorder.addEventListener('dataavailable', (event) => {
if (event.data && event.data.size > 0) audioChunks.push(event.data);
});

mediaRecorder.start();
}

export async function stopRecording() {
return new Promise((resolve, reject) => {
if (!mediaRecorder || mediaRecorder.state === 'inactive') {
reject(new Error('Not recording'));
return;
}

mediaRecorder.addEventListener('stop', () => {
const blob = new Blob(audioChunks, { type: 'audio/webm' });
if (mediaStream) {
mediaStream.getTracks().forEach((track) => track.stop());
mediaStream = null;
}
mediaRecorder = null;
audioChunks = [];
resolve(blob);
});

mediaRecorder.stop();
});
}

export function isRecording() {
return !!(mediaRecorder && mediaRecorder.state === 'recording');
}

export function speak(text) {
return new Promise((resolve) => {
if (!text || !('speechSynthesis' in window)) {
resolve();
return;
}

window.speechSynthesis.cancel();

const utterance = new SpeechSynthesisUtterance(text);
utterance.rate = 1.0;
utterance.pitch = 1.15;
utterance.volume = 1.0;

const voices = window.speechSynthesis.getVoices();
const femaleKeywords = ['female', 'woman', 'zira', 'heera', 'samantha', 'google uk english female', 'google hindi'];

let selectedVoice = null;

for (const v of voices) {
const name = (v.name || '').toLowerCase();
if (v.lang && v.lang.startsWith('hi') && femaleKeywords.some(k => name.includes(k))) {
selectedVoice = v;
break;
}
}
if (!selectedVoice) {
for (const v of voices) {
const name = (v.name || '').toLowerCase();
if (v.lang && v.lang.startsWith('hi')) { selectedVoice = v; break; }
}
}
if (!selectedVoice) {
for (const v of voices) {
const name = (v.name || '').toLowerCase();
if (femaleKeywords.some(k => name.includes(k))) { selectedVoice = v; break; }
}
}
if (!selectedVoice && voices.length > 0) {
selectedVoice = voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
}

if (selectedVoice) {
utterance.voice = selectedVoice;
utterance.lang = selectedVoice.lang;
} else {
utterance.lang = 'hi-IN';
}

utterance.onend = () => resolve();
utterance.onerror = () => resolve();

window.speechSynthesis.speak(utterance);
});
}

export function stopSpeaking() {
if ('speechSynthesis' in window) {
window.speechSynthesis.cancel();
}
}

if ('speechSynthesis' in window) {
window.speechSynthesis.onvoiceschanged = () => {};
}
