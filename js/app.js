// Mio — js/app.js (Main Orchestrator)

import { MIO_SYSTEM_PROMPT, GREETINGS, QUICK_RESPONSES } from './prompts.js';
import { chat, transcribe, setApiKey, getApiKey, checkApiKey } from './llm.js';
import { startRecording, stopRecording, speak, stopSpeaking, initVoice } from './voice.js';
import { saveMessage, getHistory, getUserNickname, extractFacts, setUserFact } from './memory.js';
import { executeAction } from './tools.js';

// ===== DOM CACHE =====
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

// ===== STATE =====
const state = {
    recording: false,
    processing: false,
    greeted: false
};

// ===== HELPERS =====

function setStatus(text, className = '') {
    if (!dom.statusText) return;
    dom.statusText.textContent = text;
    dom.statusText.className = 'status-text ' + className;
}

function setIdleUI() {
    setStatus('Tap to talk', '');
    if (dom.micContainer) dom.micContainer.classList.remove('active');
    if (dom.audioVisualizer) dom.audioVisualizer.classList.remove('active');
    if (dom.micHint) {
        dom.micHint.textContent = 'Hold to talk';
        dom.micHint.classList.remove('active');
    }
}

function setListeningUI() {
    setStatus('Sun rahi hoon...', 'listening');
    if (dom.micContainer) dom.micContainer.classList.add('active');
    if (dom.audioVisualizer) dom.audioVisualizer.classList.add('active');
    if (dom.micHint) {
        dom.micHint.textContent = 'Listening...';
        dom.micHint.classList.add('active');
    }
}

function setThinkingUI() {
    setStatus('Soch rahi hoon...', 'thinking');
    if (dom.micContainer) dom.micContainer.classList.remove('active');
    if (dom.audioVisualizer) dom.audioVisualizer.classList.remove('active');
    if (dom.micHint) {
        dom.micHint.textContent = 'Thinking...';
        dom.micHint.classList.remove('active');
    }
}

function setSpeakingUI() {
    setStatus('Bol rahi hoon...', 'speaking');
}

function showToast(text, duration = 2500) {
    if (!dom.toast) return;
    dom.toast.textContent = text;
    dom.toast.classList.add('show');
    setTimeout(() => dom.toast.classList.remove('show'), duration);
}

function scrollToBottom() {
    if (!dom.conversationArea) return;
    requestAnimationFrame(() => {
        dom.conversationArea.scrollTop = dom.conversationArea.scrollHeight;
    });
}

function getGreetingForNow() {
    const hour = new Date().getHours();
    if (hour < 12) return GREETINGS.morning;
    if (hour < 17) return GREETINGS.afternoon;
    if (hour < 21) return GREETINGS.evening;
    return GREETINGS.night;
}

function stripMarkdown(text) {
    if (!text) return '';
    return String(text)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^#+\s*/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/ACTION:\s*\{[\s\S]*?\}/g, '')
        .trim();
}

function parseActionBlock(text) {
    if (!text) return null;
    const match = text.match(/ACTION:\s*(\{[\s\S]*?\})/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[1]);
        if (parsed && parsed.action) {
            return { action: parsed.action, parameters: parsed.parameters || {} };
        }
    } catch (e) {
        return null;
    }
    return null;
}

function appendMessage(role, text) {
    if (!dom.conversationArea) return;
    if (dom.welcomeMessage && dom.welcomeMessage.parentNode) {
        dom.welcomeMessage.remove();
    }

    const msg = document.createElement('div');
    msg.className = 'message ' + (role === 'user' ? 'user' : 'mio');

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (role === 'mio') {
        avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10"/></svg>';
    } else {
        avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0112 0v2"/></svg>';
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    dom.conversationArea.appendChild(msg);
    scrollToBottom();
}

function appendTypingIndicator() {
    if (!dom.conversationArea) return null;
    const msg = document.createElement('div');
    msg.className = 'message mio';
    msg.id = 'typingIndicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10"/></svg>';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    msg.appendChild(avatar);
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
    const history = getHistory(10);
    return [
        { role: 'system', content: MIO_SYSTEM_PROMPT },
        ...history
    ];
}

async function speakWithUI(text) {
    if (!text) return;
    setSpeakingUI();
    try {
        await speak(text);
    } catch (e) {
        // no-op
    }
}

// ===== CORE PIPELINES =====

async function processAudio(blob) {
    setThinkingUI();
    let typingNode = null;
    try {
        const userText = await transcribe(blob);
        if (!userText || !userText.trim()) {
            await speakWithUI(QUICK_RESPONSES.noSpeech || 'Kuch sunai nahi diya, Boss.');
            return;
        }

        extractFacts(userText);
        saveMessage('user', userText);
        appendMessage('user', userText);

        typingNode = appendTypingIndicator();

        const messages = buildMessages();
        const rawReply = await chat(messages, { temperature: 0.75, maxTokens: 300 });

        removeTypingIndicator(typingNode);
        typingNode = null;

        const action = parseActionBlock(rawReply);
        if (action) {
            const result = await executeAction(action.action, action.parameters);
            const toolMessage = result && result.message ? result.message : (QUICK_RESPONSES.error || 'Kuch problem ho gayi.');
            saveMessage('assistant', toolMessage);
            appendMessage('mio', toolMessage);
            await speakWithUI(toolMessage);
        } else {
            const cleanReply = stripMarkdown(rawReply);
            if (cleanReply) {
                saveMessage('assistant', cleanReply);
                appendMessage('mio', cleanReply);
                await speakWithUI(cleanReply);
            } else {
                await speakWithUI(QUICK_RESPONSES.error || 'Kuch problem ho gayi.');
            }
        }
    } catch (error) {
        removeTypingIndicator(typingNode);
        console.error('[Mio] processAudio error:', error);
        showToast('Kuch problem ho gayi, Boss.');
        try {
            await speakWithUI(QUICK_RESPONSES.error || 'Kuch problem ho gayi.');
        } catch (e) { /* noop */ }
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

    let typingNode = null;
    try {
        stopSpeaking();
        setThinkingUI();

        extractFacts(userText);
        saveMessage('user', userText);
        appendMessage('user', userText);

        typingNode = appendTypingIndicator();

        const messages = buildMessages();
        const rawReply = await chat(messages, { temperature: 0.75, maxTokens: 300 });

        removeTypingIndicator(typingNode);
        typingNode = null;

        const action = parseActionBlock(rawReply);
        if (action) {
            const result = await executeAction(action.action, action.parameters);
            const toolMessage = result && result.message ? result.message : (QUICK_RESPONSES.error || 'Kuch problem ho gayi.');
            saveMessage('assistant', toolMessage);
            appendMessage('mio', toolMessage);
            await speakWithUI(toolMessage);
        } else {
            const cleanReply = stripMarkdown(rawReply);
            if (cleanReply) {
                saveMessage('assistant', cleanReply);
                appendMessage('mio', cleanReply);
                await speakWithUI(cleanReply);
            } else {
                await speakWithUI(QUICK_RESPONSES.error || 'Kuch problem ho gayi.');
            }
        }
    } catch (error) {
        removeTypingIndicator(typingNode);
        console.error('[Mio] handleTextSend error:', error);
        showToast('Kuch problem ho gayi, Boss.');
        try {
            await speakWithUI(QUICK_RESPONSES.error || 'Kuch problem ho gayi.');
        } catch (e) { /* noop */ }
    } finally {
        state.processing = false;
        setIdleUI();
    }
}

// ===== MIC HANDLERS =====

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
        console.error('[Mio] mic up error:', err);
        setIdleUI();
    }
}

// ===== SETTINGS =====

function openSettings() {
    if (dom.settingsOverlay) dom.settingsOverlay.classList.add('open');
    try {
        const key = getApiKey();
        if (dom.apiKeyInput) dom.apiKeyInput.value = key;
    } catch (e) { /* noop */ }

    const nickname = getUserNickname();
    if (dom.userNameInput) dom.userNameInput.value = nickname === 'Boss' ? '' : nickname;
}

function closeSettings() {
    if (dom.settingsOverlay) dom.settingsOverlay.classList.remove('open');
}

function saveSettings() {
    const key = dom.apiKeyInput ? dom.apiKeyInput.value.trim() : '';
    const name = dom.userNameInput ? dom.userNameInput.value.trim() : '';

    if (key) setApiKey(key);
    if (name && name.toLowerCase() !== 'raju' && name.toLowerCase() !== 'raju ji') {
        setUserFact('nickname', name);
    }

    showToast('Settings saved, Boss.');
    closeSettings();
}

// ===== GREETING =====

async function greetOnLoad() {
    if (state.greeted) return;
    state.greeted = true;

    const greeting = getGreetingForNow();
    appendMessage('mio', greeting);
    try {
        await speakWithUI(greeting);
    } catch (e) { /* noop */ }
    setIdleUI();
}

// ===== INIT =====

async function init() {
    const voice = await initVoice();
    if (!voice.supported) {
        showToast('Yeh browser voice support nahi karta.');
    }

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

    if (dom.sendBtn) {
        dom.sendBtn.addEventListener('click', handleTextSend);
    }
    if (dom.textInput) {
        dom.textInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleTextSend();
            }
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
