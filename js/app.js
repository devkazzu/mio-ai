// Mio — js/app.js

import { MIO_SYSTEM_PROMPT, GREETINGS, QUICK_RESPONSES, NICKNAMES } from './prompts.js';
import { chat, transcribe, getApiKey, setApiKey, checkApiKey } from './llm.js';
import { startRecording, stopRecording, speak, stopSpeaking, isRecording, initVoice } from './voice.js';
import { saveMessage, getHistory, getUserNickname, extractFacts, clearHistory } from './memory.js';
import { executeAction } from './tools.js';

// ===== Cached DOM elements =====
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
    avatarSection: document.getElementById('avatarSection'),
    textInput: document.getElementById('textInput'),
    sendBtn: document.getElementById('sendBtn')
};

// ===== Internal state =====
const state = {
    processing: false,
    toastTimer: null,
    hasConversation: false
};

/**
 * Returns a time-based Hinglish greeting.
 * @returns {string} A greeting string from GREETINGS.
 */
function getGreetingForNow() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return GREETINGS.morning;
    if (hour >= 12 && hour < 17) return GREETINGS.afternoon;
    if (hour >= 17 && hour < 21) return GREETINGS.evening;
    return GREETINGS.night;
}

/**
 * Updates the status text and its visual state class.
 * @param {string} text - Text to display.
 * @param {string} [className=''] - Optional state class.
 */
function setStatus(text, className = '') {
    if (!dom.statusText) return;
    dom.statusText.textContent = text;
    dom.statusText.className = 'status-text';
    if (className) {
        dom.statusText.classList.add(className);
    }
}

/**
 * Shows a temporary toast message.
 * @param {string} text - Message to show.
 */
function showToast(text) {
    if (!dom.toast) return;
    dom.toast.textContent = text;
    dom.toast.classList.add('show');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
        dom.toast.classList.remove('show');
    }, 2500);
}

/**
 * Smoothly scrolls the conversation area to the bottom.
 */
function scrollToBottom() {
    if (!dom.conversationArea) return;
    requestAnimationFrame(() => {
        dom.conversationArea.scrollTo({
            top: dom.conversationArea.scrollHeight,
            behavior: 'smooth'
        });
    });
}

/**
 * Removes markdown syntax that shouldn't be spoken or shown as text.
 * @param {string} text - Raw text.
 * @returns {string} Cleaned text.
 */
function stripMarkdown(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
}

/**
 * Formats a Date into an HH:MM time string.
 * @param {Date} date - Date to format.
 * @returns {string} Formatted time.
 */
function formatTime(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

/**
 * Creates the Mio avatar SVG element for message bubbles.
 * @returns {SVGSVGElement} The SVG element.
 */
function createMioAvatarSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z');
    path.setAttribute('fill', 'white');
    svg.appendChild(path);
    return svg;
}

/**
 * Creates the user avatar SVG element for message bubbles.
 * @returns {SVGSVGElement} The SVG element.
 */
function createUserAvatarSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#a89db8');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '4');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 21c0-4 4-6 8-6s8 2 8 6');
    svg.appendChild(circle);
    svg.appendChild(path);
    return svg;
}

/**
 * Removes the welcome message once real conversation begins.
 */
function hideWelcomeIfNeeded() {
    if (state.hasConversation) return;
    if (dom.welcomeMessage && dom.welcomeMessage.parentNode) {
        dom.welcomeMessage.parentNode.removeChild(dom.welcomeMessage);
    }
    if (dom.avatarSection) {
        dom.avatarSection.classList.add('compact');
    }
    state.hasConversation = true;
}

/**
 * Appends a message bubble to the conversation area.
 * @param {'user'|'mio'} role - Message author.
 * @param {string} text - Message text.
 */
function appendMessage(role, text) {
    if (!dom.conversationArea || !text) return;

    hideWelcomeIfNeeded();

    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'message-avatar';
    avatarEl.appendChild(role === 'mio' ? createMioAvatarSvg() : createUserAvatarSvg());

    const contentWrap = document.createElement('div');

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'message-bubble';
    bubbleEl.textContent = text;

    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = formatTime(new Date());

    contentWrap.appendChild(bubbleEl);
    contentWrap.appendChild(timeEl);

    messageEl.appendChild(avatarEl);
    messageEl.appendChild(contentWrap);

    dom.conversationArea.appendChild(messageEl);
    scrollToBottom();
}

/**
 * Appends a typing indicator to the conversation area.
 * @returns {HTMLElement|null} The created indicator element.
 */
function appendTypingIndicator() {
    if (!dom.conversationArea) return null;
    hideWelcomeIfNeeded();

    const messageEl = document.createElement('div');
    messageEl.className = 'message mio';
    messageEl.dataset.typing = 'true';

    const avatarEl = document.createElement('div');
    avatarEl.className = 'message-avatar';
    avatarEl.appendChild(createMioAvatarSvg());

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'message-bubble';

    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    for (let i = 0; i < 3; i += 1) {
        indicator.appendChild(document.createElement('span'));
    }
    bubbleEl.appendChild(indicator);

    messageEl.appendChild(avatarEl);
    messageEl.appendChild(bubbleEl);
    dom.conversationArea.appendChild(messageEl);
    scrollToBottom();

    return messageEl;
}

/**
 * Removes a typing indicator element.
 * @param {HTMLElement|null} node - The indicator to remove.
 */
function removeTypingIndicator(node) {
    if (node && node.parentNode) {
        node.parentNode.removeChild(node);
    }
}

/**
 * Sets the UI to idle state.
 */
function setIdleUI() {
    setStatus('Tap to talk', '');
    if (dom.micContainer) dom.micContainer.classList.remove('active');
    if (dom.micBtn) dom.micBtn.classList.remove('active');
    if (dom.audioVisualizer) dom.audioVisualizer.classList.remove('active');
    if (dom.avatarContainer) dom.avatarContainer.classList.remove('active');
    if (dom.micHint) {
        dom.micHint.textContent = 'Hold to talk';
        dom.micHint.classList.remove('active');
    }
}

/**
 * Sets the UI to listening state.
 */
function setListeningUI() {
    setStatus('Sun rahi hoon...', 'listening');
    if (dom.micContainer) dom.micContainer.classList.add('active');
    if (dom.micBtn) dom.micBtn.classList.add('active');
    if (dom.audioVisualizer) dom.audioVisualizer.classList.add('active');
    if (dom.avatarContainer) dom.avatarContainer.classList.add('active');
    if (dom.micHint) {
        dom.micHint.textContent = 'Listening';
        dom.micHint.classList.add('active');
    }
}

/**
 * Sets the UI to thinking state.
 */
function setThinkingUI() {
    setStatus('Soch rahi hoon...', 'thinking');
    if (dom.micContainer) dom.micContainer.classList.remove('active');
    if (dom.micBtn) dom.micBtn.classList.remove('active');
    if (dom.audioVisualizer) dom.audioVisualizer.classList.remove('active');
    if (dom.avatarContainer) dom.avatarContainer.classList.add('active');
    if (dom.micHint) {
        dom.micHint.textContent = 'Thinking';
        dom.micHint.classList.remove('active');
    }
}

/**
 * Sets the UI to speaking state.
 */
function setSpeakingUI() {
    setStatus('Bol rahi hoon...', 'speaking');
    if (dom.avatarContainer) dom.avatarContainer.classList.add('active');
    if (dom.micHint) {
        dom.micHint.textContent = 'Speaking';
    }
}

/**
 * Opens the settings overlay and pre-fills inputs.
 */
function openSettings() {
    if (!dom.settingsOverlay) return;
    try {
        const key = localStorage.getItem('mio_api_key') || '';
        if (dom.apiKeyInput) dom.apiKeyInput.value = key;
    } catch { /* noop */ }

    if (dom.userNameInput) {
        const nick = getUserNickname();
        dom.userNameInput.value = nick === 'Boss' ? '' : nick;
    }

    dom.settingsOverlay.classList.add('open');
}

/**
 * Closes the settings overlay.
 */
function closeSettings() {
    if (dom.settingsOverlay) dom.settingsOverlay.classList.remove('open');
}

/**
 * Saves settings from the form inputs.
 */
function handleSaveSettings() {
    const keyValue = dom.apiKeyInput ? dom.apiKeyInput.value.trim() : '';
    const nickValue = dom.userNameInput ? dom.userNameInput.value.trim() : '';

    try {
        setApiKey(keyValue);
    } catch { /* noop */ }

    try {
        if (nickValue) {
            const facts = JSON.parse(localStorage.getItem('mio_facts') || '{}');
            const safeFacts = (facts && typeof facts === 'object' && !Array.isArray(facts)) ? facts : {};
            safeFacts.nickname = nickValue;
            localStorage.setItem('mio_facts', JSON.stringify(safeFacts));
        }
    } catch { /* noop */ }

    closeSettings();
    showToast('Settings saved, Boss.');
}

/**
 * Parses an ACTION line from Mio's reply.
 * @param {string} reply - Mio's raw reply text.
 * @returns {{action: string, parameters: Object}|null} Parsed action or null.
 */
function parseActionBlock(reply) {
    if (typeof reply !== 'string') return null;
    const trimmed = reply.trim();
    if (!trimmed.toUpperCase().startsWith('ACTION:')) return null;

    const jsonPart = trimmed.slice(trimmed.indexOf(':') + 1).trim();
    const firstBrace = jsonPart.indexOf('{');
    const lastBrace = jsonPart.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

    try {
        const parsed = JSON.parse(jsonPart.slice(firstBrace, lastBrace + 1));
        if (!parsed || typeof parsed !== 'object') return null;
        const action = typeof parsed.action === 'string' ? parsed.action : '';
        const parameters = (parsed.parameters && typeof parsed.parameters === 'object') ? parsed.parameters : {};
        if (!action) return null;
        return { action, parameters };
    } catch {
        return null;
    }
}

/**
 * Builds the message array sent to the LLM.
 * @returns {Array<{role: string, content: string}>} Prepared messages.
 */
function buildMessages() {
    const nickname = getUserNickname();
    const contextLine = `Context: The user's preferred nickname is "${nickname}". Use it naturally. Never call them "Raju".`;
    return [
        { role: 'system', content: `${MIO_SYSTEM_PROMPT}\n\n${contextLine}` },
        ...getHistory(10)
    ];
}

/**
 * Processes an audio blob: transcribes, sends to LLM, speaks reply.
 * @param {Blob} audioBlob - Recorded audio blob.
 */
async function processAudio(audioBlob) {
    let typingNode = null;
    try {
        setThinkingUI();

        if (!audioBlob || audioBlob.size === 0) {
            setIdleUI();
            return;
        }
        /**
 * Processes a direct text message from the text input bar.
 */
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
            const toolMessage = result?.message || QUICK_RESPONSES.error;
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
                await speakWithUI(QUICK_RESPONSES.error);
            }
        }
    } catch (error) {
        removeTypingIndicator(typingNode);
        console.error('[Mio] handleTextSend error:', error);
        showToast('Kuch problem ho gayi, Boss.');
        try {
            await speakWithUI(QUICK_RESPONSES.error);
        } catch { /* noop */ }
    } finally {
        state.processing = false;
        setIdleUI();
    }
}

        const userText = (await transcribe(audioBlob) || '').trim();

        if (!userText) {
            const noSpeech = QUICK_RESPONSES.noSpeech || 'Kuch sunayi nahi diya, Boss. Phir se bolo.';
            setIdleUI();
            await speakWithUI(noSpeech);
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
            const toolMessage = result?.message || QUICK_RESPONSES.error;
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
                await speakWithUI(QUICK_RESPONSES.error);
            }
        }
    } catch (error) {
        removeTypingIndicator(typingNode);
        console.error('[Mio] processAudio error:', error);
        showToast('Kuch problem ho gayi, Boss.');
        try {
            await speakWithUI(QUICK_RESPONSES.error);
        } catch { /* noop */ }
    } finally {
        state.processing = false;
        setIdleUI();
    }
}

/**
 * Speaks text with the speaking UI state applied.
 * @param {string} text - Text to speak.
 * @returns {Promise<void>} Resolves when speech ends.
 */
async function speakWithUI(text) {
    setSpeakingUI();
    try {
        await speak(text);
    } catch { /* noop */ }
}

/**
 * Handles start of hold-to-talk gesture.
 * @param {PointerEvent} event - Pointer event.
 */
async function handleMicPress(event) {
    if (event) event.preventDefault();
    if (state.processing || isRecording()) return;

    const hasKey = await checkApiKey();
    if (!hasKey) {
        showToast('Pehle API key daalo, Boss.');
        openSettings();
        return;
    }

    stopSpeaking();

    try {
        await startRecording();
        setListeningUI();
    } catch (error) {
        console.error('[Mio] startRecording error:', error);
        showToast('Mic permission chahiye, Boss.');
        setIdleUI();
    }
}

/**
 * Handles end of hold-to-talk gesture.
 * @param {PointerEvent} event - Pointer event.
 */
async function handleMicRelease(event) {
    if (event) event.preventDefault();
    if (!isRecording()) return;
    if (state.processing) return;

    state.processing = true;
    try {
        const audioBlob = await stopRecording();
        await processAudio(audioBlob);
    } catch (error) {
        console.error('[Mio] handleMicRelease error:', error);
        state.processing = false;
        setIdleUI();
        showToast('Kuch problem ho gayi, Boss.');
    }
}

/**
 * Attaches all event listeners for the app.
 */
function bindEvents() {
    if (dom.micBtn) {
        dom.micBtn.addEventListener('pointerdown', handleMicPress);
        dom.micBtn.addEventListener('pointerup', handleMicRelease);
        dom.micBtn.addEventListener('pointerleave', handleMicRelease);
        dom.micBtn.addEventListener('pointercancel', handleMicRelease);
        dom.micBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    if (dom.settingsBtn) {
        dom.settingsBtn.addEventListener('click', openSettings);
    }
    if (dom.settingsClose) {
        dom.settingsClose.addEventListener('click', closeSettings);
    }
    if (dom.settingsOverlay) {
        dom.settingsOverlay.addEventListener('click', (event) => {
            if (event.target === dom.settingsOverlay) closeSettings();
        });
    }
    if (dom.settingsSaveBtn) {
        dom.settingsSaveBtn.addEventListener('click', handleSaveSettings);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeSettings();
            stopSpeaking();
        }
    });
}

/**
 * Registers the service worker for PWA support.
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((error) => {
            console.error('[Mio] Service worker registration failed:', error);
        });
    });
}

/**
 * Preloads settings inputs with saved values.
 */
function preloadSettings() {
    try {
        const key = localStorage.getItem('mio_api_key') || '';
        if (dom.apiKeyInput) dom.apiKeyInput.value = key;
    } catch { /* noop */ }

    if (dom.userNameInput) {
        const nick = getUserNickname();
        dom.userNameInput.value = nick === 'Boss' ? '' : nick;
    }
}

/**
 * Delivers the initial time-based greeting.
 */
async function greetUser() {
    const greeting = getGreetingForNow();
    if (dom.welcomeMessage) {
        const greetingEl = dom.welcomeMessage.querySelector('.greeting');
        const nickname = getUserNickname();
        if (greetingEl) {
            greetingEl.textContent = `Namaste, ${nickname} ✨`;
        }
    }
    try {
        await speakWithUI(greeting);
    } catch { /* noop */ }
    setIdleUI();
}

/**
 * Initializes the entire Mio application.
 */
async function init() {
    bindEvents();
    preloadSettings();
    registerServiceWorker();

    const voiceStatus = await initVoice();
    if (!voiceStatus.supported) {
        showToast('Voice support nahi hai is browser mein, Boss.');
        setStatus('Voice not supported', '');
        if (dom.micBtn) dom.micBtn.disabled = true;
    } else {
        setIdleUI();
    }

    const hasKey = await checkApiKey();
    if (!hasKey) {
        openSettings();
        showToast('Groq API key add karo, Boss.');
    } else {
        greetUser();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
