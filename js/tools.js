// Mio — js/tools.js

import { clearHistory } from './memory.js';

const REMINDERS_STORAGE_KEY = 'mio_reminders';

/**
 * Safely reads and parses a JSON value from localStorage.
 * @param {string} key - The localStorage key.
 * @param {*} fallback - Value returned when reading or parsing fails.
 * @returns {*} The parsed value or fallback.
 */
function readStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

/**
 * Safely writes a JSON value to localStorage.
 * @param {string} key - The localStorage key.
 * @param {*} value - The value to store.
 * @returns {boolean} Whether the write succeeded.
 */
function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

/**
 * Requests notification permission if not yet decided.
 * @returns {Promise<boolean>} Whether notifications are permitted.
 */
async function ensureNotificationPermission() {
    try {
        if (typeof Notification === 'undefined') return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;
        const result = await Notification.requestPermission();
        return result === 'granted';
    } catch {
        return false;
    }
}

/**
 * Shows a browser notification if permission is granted.
 * @param {string} title - Notification title.
 * @param {string} body - Notification body.
 */
function showNotification(title, body) {
    try {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;
        new Notification(title, { body });
    } catch {
        /* noop */
    }
}

/**
 * Converts a number 0-59 into a spoken Hinglish form.
 * @param {number} value - Numeric value.
 * @returns {string} Value as a string.
 */
function toSpoken(value) {
    return String(value);
}

/**
 * Formats current time into a Hinglish sentence.
 * @param {Date} date - Date instance.
 * @returns {string} Hinglish time string.
 */
function formatHinglishTime(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;

    if (minutes === 0) {
        return `Abhi ${toSpoken(displayHours)} baje hain ${period}, Boss.`;
    }
    return `Abhi ${toSpoken(displayHours)} baj ke ${toSpoken(minutes)} minute hue hain ${period}, Boss.`;
}

/**
 * Formats today's date into a Hinglish sentence.
 * @param {Date} date - Date instance.
 * @returns {string} Hinglish date string.
 */
function formatHinglishDate(date) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const weekday = days[date.getDay()];
    return `Aaj ${weekday}, ${day} ${month} ${year} hai, Boss.`;
}

/**
 * Validates an "HH:MM" 24-hour time string.
 * @param {string} time - Time string to validate.
 * @returns {boolean} Whether the string is valid.
 */
function isValidTime(time) {
    if (typeof time !== 'string') return false;
    return /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim());
}

/**
 * Handles the "reminder" action.
 * @param {{text?: string, time?: string}} parameters - Action parameters.
 * @returns {Promise<{success: boolean, message: string, data?: any}>} Result.
 */
async function handleReminder(parameters) {
    const text = typeof parameters?.text === 'string' ? parameters.text.trim() : '';
    const time = typeof parameters?.time === 'string' ? parameters.time.trim() : '';

    if (!text) {
        return { success: false, message: 'Reminder ka text nahi mila, Boss.' };
    }
    if (!isValidTime(time)) {
        return { success: false, message: 'Time thoda clear batao, Boss — HH:MM format mein.' };
    }

    try {
        const stored = readStorage(REMINDERS_STORAGE_KEY, []);
        const reminders = Array.isArray(stored) ? stored : [];

        const reminder = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text,
            time,
            createdAt: new Date().toISOString(),
            fired: false
        };

        reminders.push(reminder);
        const saved = writeStorage(REMINDERS_STORAGE_KEY, reminders);

        if (!saved) {
            return { success: false, message: 'Reminder save nahi ho paaya, Boss.' };
        }

        await ensureNotificationPermission();

        return {
            success: true,
            message: `Reminder set kar diya, Boss — ${time} baje "${text}".`,
            data: reminder
        };
    } catch {
        return { success: false, message: 'Reminder set karte waqt kuch gadbad ho gayi, Boss.' };
    }
}

/**
 * Handles the "timer" action.
 * @param {{seconds?: number, label?: string}} parameters - Action parameters.
 * @returns {Promise<{success: boolean, message: string, data?: any}>} Result.
 */
async function handleTimer(parameters) {
    const seconds = Number(parameters?.seconds);
    const label = typeof parameters?.label === 'string' && parameters.label.trim() !== ''
        ? parameters.label.trim()
        : 'Timer';

    if (!Number.isFinite(seconds) || seconds <= 0) {
        return { success: false, message: 'Timer ke liye seconds theek se batao, Boss.' };
    }

    await ensureNotificationPermission();

    const durationMs = Math.floor(seconds * 1000);
    const finishTime = new Date(Date.now() + durationMs);

    setTimeout(() => {
        showNotification('Mio — Timer', `${label} pura ho gaya, Boss.`);
        try {
            console.info(`[Mio] Timer "${label}" complete at ${finishTime.toLocaleTimeString()}`);
        } catch { /* noop */ }
    }, durationMs);

    let readable;
    if (seconds < 60) {
        readable = `${Math.round(seconds)} second`;
    } else if (seconds < 3600) {
        readable = `${Math.round(seconds / 60)} minute`;
    } else {
        readable = `${(seconds / 3600).toFixed(1)} ghante`;
    }

    return {
        success: true,
        message: `Timer set kar diya, Boss — ${readable} ka.`,
        data: { seconds, label, finishAt: finishTime.toISOString() }
    };
}

/**
 * Handles the "search" action.
 * @param {{query?: string}} parameters - Action parameters.
 * @returns {Promise<{success: boolean, message: string, data?: any}>} Result.
 */
async function handleSearch(parameters) {
    const query = typeof parameters?.query === 'string' ? parameters.query.trim() : '';
    if (!query) {
        return { success: false, message: 'Search karne ke liye kuch batao, Boss.' };
    }

    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    try {
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
            window.open(url, '_blank', 'noopener');
        }
    } catch { /* noop */ }

    return {
        success: true,
        message: `Google pe "${query}" search kar rahi hoon, Boss.`,
        data: { query, url }
    };
}

/**
 * Handles the "time" action.
 * @returns {Promise<{success: boolean, message: string, data?: any}>} Result.
 */
async function handleTime() {
    const now = new Date();
    return {
        success: true,
        message: formatHinglishTime(now),
        data: { iso: now.toISOString() }
    };
}

/**
 * Handles the "date" action.
 * @returns {Promise<{success: boolean, message: string, data?: any}>} Result.
 */
async function handleDate() {
    const now = new Date();
    return {
        success: true,
        message: formatHinglishDate(now),
        data: { iso: now.toISOString() }
    };
}

/**
 * Handles the "clearHistory" action.
 * @returns {Promise<{success: boolean, message: string}>} Result.
 */
async function handleClearHistory() {
    try {
        const ok = clearHistory();
        if (ok) {
            return { success: true, message: 'Poori history clear kar di, Boss. Fresh start.' };
        }
        return { success: false, message: 'History clear nahi kar paayi, Boss.' };
    } catch {
        return { success: false, message: 'History clear karte waqt problem ho gayi, Boss.' };
    }
}

/**
 * Executes a Mio tool action by name.
 * @param {string} actionName - Name of the action to run.
 * @param {Object} [parameters={}] - Parameters for the action.
 * @returns {Promise<{success: boolean, message: string, data?: any}>} Result.
 */
export async function executeAction(actionName, parameters = {}) {
    const params = parameters && typeof parameters === 'object' ? parameters : {};
    const name = typeof actionName === 'string' ? actionName.trim().toLowerCase() : '';

    switch (name) {
        case 'reminder':
            return handleReminder(params);
        case 'timer':
            return handleTimer(params);
        case 'search':
            return handleSearch(params);
        case 'time':
            return handleTime();
        case 'date':
            return handleDate();
        case 'clearhistory':
        case 'clear_history':
            return handleClearHistory();
        default:
            return { success: false, message: 'Yeh kaam mujhe nahi aata, Boss.' };
    }
}

/**
 * Returns all saved reminders.
 * @returns {Array<Object>} Array of reminder objects.
 */
export function getReminders() {
    try {
        const stored = readStorage(REMINDERS_STORAGE_KEY, []);
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

/**
 * Removes all saved reminders.
 * @returns {boolean} Whether the wipe succeeded.
 */
export function clearReminders() {
    try {
        localStorage.removeItem(REMINDERS_STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}
