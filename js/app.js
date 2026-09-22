// Mio — js/app.js

import { MIO_SYSTEM_PROMPT, GREETINGS, QUICK_RESPONSES } from './prompts.js';
import { chat, transcribe, setApiKey, getApiKey, checkApiKey } from './llm.js';
import { startRecording, stopRecording, speak, stopSpeaking, initVoice } from './voice.js';
import { saveMessage, getHistory, getUserNickname, extractFacts, setUserFact } from './memory.js';
import { executeAction } from './tools.js';

const dom = {
micBtn: document.getElementById('micBtn'),
micContainer: document.getElementById('micContainer'),
micHint: document.getElementById('micHint'),
statusText: document.getElementById('statusText'),
conversationArea: document.getElementById('conversationArea'),
welcomeMessage: document.getElementById('welcomeMessage'),
settingsBtn: document.getElementById('settingsBtn'),
settingsOverlay: document.getElementById('settingsOverlay'),
settingsClose: document.getElementById('settingsClose'),
apiKeyInput: document.getElementById('apiKeyInput'),
userNameInput: document.getElementById('userNameInput'),
settingsSaveBtn: document.getElementById('settingsSaveBtn'),
toast: document.getElementById('toast'),
avatarContainer: document.getElementById('avatarContainer'),
audioVisualizer: document.getElementById('audioVisualizer'),
textInput: document.getElementById('textInput'),
sendBtn: document.getElementById('sendBtn')
};

const state = { recording: false, processing: false, greeted: false };

function setStatus(text, cls = '') {
if (!dom.statusText) return;
dom.statusText.textContent = text;
dom.statusText.className = 'status-text ' + cls;
}

function setIdleUI() {
setStatus('Tap to talk', '');
if (dom.micContainer) dom.micContainer.classList.remove('active');
if (dom.audioVisualizer) dom.audioVisualizer.classList.remove('active');
if (dom.avatarContainer) dom.avatarContainer.classList.remove('active');
if (dom.micHint) { dom.micHint.textContent = 'Hold to talk'; dom.micHint.classList.remove('active'); }
}

function setListeningUI() {
setStatus('Sun rahi hoon...', 'listening');
if (dom.micContainer) dom.micContainer.classList.add('active');
if (dom.audioVisualizer) dom.audioVisualizer.classList.add('active');
if (dom.avatarContainer) dom.avatarContainer.classList.add('active');
if (dom.micHint) { dom.micHint.textContent = 'Listening'; dom.micHint.classList.add('active'); }
}

function setThinkingUI() {
setStatus('Soch rahi hoon...', 'thinking');
if (dom.micContainer) dom.micContainer.classList.remove('active');
if (dom.audioVisualizer) dom.audioVisualizer.classList.remove('active');
if (dom.avatarContainer) dom.avatarContainer.classList.remove('active');
if (dom.micHint) { dom.micHint.textContent = 'Thinking'; dom.micHint.classList.remove('active'); }
}

function setSpeakingUI() {
setStatus('Bol rahi hoon...', 'speaking');
if (dom.avatarContainer) dom.avatarContainer.classList.add('active');
}

function showToast(text, dur = 2500) {
if (!dom.toast) return;
dom.toast.textContent = text;
dom.toast.classList.add('show');
setTimeout(() => dom.toast.classList.remove('show'), dur);
}

function scrollToBottom() {
if (!dom.conversationArea) return;
requestAnimationFrame(() => {
dom.conversationArea.scrollTop = dom.conversationArea.scrollHeight;
});
}

function getGreetingForNow() {
const h = new Date().getHours();
if (h < 12) return GREETINGS.morning;
if (h < 17) return GREETINGS.afternoon;
if (h < 21) return GREETINGS.evening;
return GREETINGS.night;
}

function stripMarkdown(text) {
if (!text) return '';
return String(text)
.replace(/ACTION:\s*\{[\s\S]*?\}/g, '')
.replace(/```[\s\S]*?```/g, '')
.replace(/`([^`]+)`/g, '$1')
.replace(/\*\*([^*]+)\*\*/g, '$1')
.replace(/\*([^*]+)\*/g, '$1')
.replace(/^#+\s*/gm, '')
.trim();
}

function parseActionBlock(text) {
if (!text) return null;
const m = text.match(/ACTION:\s*(\{[\s\S]*?\})/);
if (!m) return null;
try {
const p = JSON.parse(m[1]);
if (p && p.action) return { action: p.action, parameters: p.parameters || {} };
} catch { return null; }
return null;
}

function appendMessage(role, text) {
if (!dom.conversationArea) return;
if (dom.welcomeMessage && dom.welcomeMessage.parentNode) dom.welcomeMessage.remove();

const msg = document.createElement('div');
msg.className = 'message ' + (role === 'user' ? 'user' : 'mio');

const av = document.createElement('div');
av.className = 'message-avatar';
if (role === 'mio') {
av.innerHTML = '<svg viewBox="0 0 24 24" fill="white"><path d="M12 2L13.5 9L20 8L15 12L20 16L13.5 15L12 22L10.5 15L4 16L9 12L4 8L10.5 9L12 2Z"/></svg>';
} else {
av.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0112 0v2"/></svg>';
}

const bubble = document.createElement('div');
bubble.className = 'message-bubble';
bubble.textContent = text;

msg.appendChild(av);
msg.appendChild(bubble);
dom.conversationArea.appendChild(msg);
scrollToBottom();
}

function appendTypingIndicator() {
if (!dom.conversationArea) return null;
const msg = document.createElement('div');
msg.className = 'message mio';
msg.id = 'typingIndicator';

const av = document.createElement('div');
av.className = 'message-avatar';
av.innerHTML = '<svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10"/></svg>';

const bubble = document.createElement('div');
bubble.className = 'message-bubble';
bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

msg.appendChild(av);
msg.appendChild(bubble);
dom.conversationArea.appendChild(msg);
scrollToBottom();
return msg;
}

function removeTypingIndicator(node) {
if (node && node.parentNode) node.remove();
else {
const el = document.getElementById('typingIndicator');
if (el) el.remove();
}
}

function buildMessages() {
return [{ role: 'system', content: MIO_SYSTEM_PROMPT }, ...getHistory(10)];
}

async function speakWithUI(text) {
if (!text) return;
setSpeakingUI();
try { await speak(text); } catch { /* noop */ }
}

async function handleUserMessage(userText) {
extractFacts(userText);
saveMessage('user', userText);
appendMessage('user', userText);

const typing = appendTypingIndicator();
try {
const raw = await chat(buildMessages(), { temperature: 0.75, maxTokens: 300 });
removeTypingIndicator(typing);

const action = parseActionBlock(raw);
if (action) {
const result = await executeAction(action.action, action.parameters);
const msg = (result && result.message) || QUICK_RESPONSES.error;
saveMessage('assistant', msg);
appendMessage('mio', msg);
await speakWithUI(msg);
} else {
const clean = stripMarkdown(raw);
if (clean) {
saveMessage('assistant', clean);
appendMessage('mio', clean);
await speakWithUI(clean);
} else {
await speakWithUI(QUICK_RESPONSES.error);
}
}
} catch (e) {
removeTypingIndicator(typing);
console.error('[Mio]', e);
showToast('Kuch problem ho gayi, Boss.');
try { await speakWithUI(QUICK_RESPONSES.error); } catch { /* noop */ }
}
}

async function processAudio(blob) {
setThinkingUI();
try {
const userText = await transcribe(blob);
if (!userText || !userText.trim()) {
await speakWithUI(QUICK_RESPONSES.noSpeech);
return;
}
await handleUserMessage(userText);
} catch (e) {
console.error('[Mio] audio error', e);
showToast('Transcription fail ho gayi.');
} finally {
setIdleUI();
}
}

async function handleTextSend() {
if (state.processing) return;
if (!dom.textInput) return;

const userText = dom.textInput.value.trim();
if (!userText) return;

dom.textInput.value = '';
state.processing = true;

try {
stopSpeaking();
setThinkingUI();
await handleUserMessage(userText);
} catch (e) {
console.error('[Mio] text error', e);
} finally {
state.processing = false;
setIdleUI();
}
}

async function onMicDown(e) {
e.preventDefault();
if (state.recording || state.processing) return;

const ok = await checkApiKey();
if (!ok) {
showToast('Pehle API key daalo, Boss.');
if (dom.settingsOverlay) dom.settingsOverlay.classList.add('open');
return;
}

try {
stopSpeaking();
await startRecording();
state.recording = true;
setListeningUI();
} catch (err) {
state.recording = false;
setIdleUI();
showToast('Mic permission denied.');
}
}

async function onMicUp(e) {
if (!state.recording) return;
state.recording = false;
setThinkingUI();

try {
const blob = await stopRecording();
if (!blob || blob.size === 0) {
setIdleUI();
return;
}
await processAudio(blob);
} catch (err) {
console.error('[Mio] mic error', err);
setIdleUI();
}
}

function openSettings() {
if (dom.settingsOverlay) dom.settingsOverlay.classList.add('open');
try {
const k = getApiKey();
if (dom.apiKeyInput) dom.apiKeyInput.value = k;
} catch { /* noop */ }

const n = getUserNickname();
if (dom.userNameInput) dom.userNameInput.value = (n === 'Boss') ? '' : n;
}

function closeSettings() {
if (dom.settingsOverlay) dom.settingsOverlay.classList.remove('open');
}

function saveSettings() {
const key = dom.apiKeyInput ? dom.apiKeyInput.value.trim() : '';
const name = dom.userNameInput ? dom.userNameInput.value.trim() : '';

if (key) setApiKey(key);
if (name) {
const lower = name.toLowerCase();
if (lower !== 'raju' && lower !== 'raju ji') setUserFact('nickname', name);
}

showToast('Settings saved, Boss.');
closeSettings();
}

async function greetOnLoad() {
if (state.greeted) return;
state.greeted = true;

const g = getGreetingForNow();
appendMessage('mio', g);
try { await speakWithUI(g); } catch { /* noop */ }
setIdleUI();
}

async function init() {
const v = await initVoice();
if (!v.supported) showToast('Yeh browser voice support nahi karta.');

const hasKey = await checkApiKey();
if (!hasKey) {
setTimeout(() => openSettings(), 800);
return;
}

setTimeout(() => greetOnLoad(), 600);
}

function bindEvents() {
if (dom.micBtn) {
dom.micBtn.addEventListener('pointerdown', onMicDown);
dom.micBtn.addEventListener('pointerup', onMicUp);
dom.micBtn.addEventListener('pointerleave', onMicUp);
dom.micBtn.addEventListener('pointercancel', onMicUp);
}

if (dom.sendBtn) dom.sendBtn.addEventListener('click', handleTextSend);
if (dom.textInput) {
dom.textInput.addEventListener('keydown', (e) => {
if (e.key === 'Enter') { e.preventDefault(); handleTextSend(); }
});
}

if (dom.settingsBtn) dom.settingsBtn.addEventListener('click', openSettings);
if (dom.settingsClose) dom.settingsClose.addEventListener('click', closeSettings);
if (dom.settingsSaveBtn) dom.settingsSaveBtn.addEventListener('click', saveSettings);

if (dom.settingsOverlay) {
dom.settingsOverlay.addEventListener('click', (e) => {
if (e.target === dom.settingsOverlay) closeSettings();
});
}
}

window.addEventListener('DOMContentLoaded', () => {
bindEvents();
init();

if ('serviceWorker' in navigator) {
navigator.serviceWorker.register('sw.js').catch(() => {});
}
});
