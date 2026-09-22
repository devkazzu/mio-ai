// Mio — js/tools.js

import { clearHistory } from './memory.js';

const REMINDERS_KEY = 'mio_reminders';
const NOTES_KEY = 'mio_notes';
const TODOS_KEY = 'mio_todos';

function readArr(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function writeArr(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); return true; }
    catch { return false; }
}

// ===== REMINDERS =====
export function getReminders() { return readArr(REMINDERS_KEY); }
export function clearReminders() {
    try { localStorage.removeItem(REMINDERS_KEY); return true; } catch { return false; }
}

export async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
        const result = await Notification.requestPermission();
        return result;
    } catch { return 'error'; }
}

function fireNotification(title, body) {
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: 'icons/icon-192.png' });
        }
    } catch { /* noop */ }
}

// Start a background checker for reminders (runs every 30s while page is open)
let reminderCheckerId = null;
export function startReminderChecker() {
    if (reminderCheckerId) return;
    reminderCheckerId = setInterval(() => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const current = `${hh}:${mm}`;
        const today = now.toDateString();

        const reminders = readArr(REMINDERS_KEY);
        let changed = false;

        for (const r of reminders) {
            if (r.time === current && r.lastFired !== today) {
                fireNotification('Mio Reminder', r.text || 'Reminder');
                r.lastFired = today;
                changed = true;
            }
        }

        if (changed) writeArr(REMINDERS_KEY, reminders);
    }, 30000);
}

// ===== NOTES =====
export function getNotes() { return readArr(NOTES_KEY); }

function addNote(text) {
    const notes = readArr(NOTES_KEY);
    const note = { id: Date.now(), text, created: Date.now() };
    notes.push(note);
    writeArr(NOTES_KEY, notes);
    return note;
}

function deleteNote(id) {
    const notes = readArr(NOTES_KEY).filter(n => n.id !== id);
    return writeArr(NOTES_KEY, notes);
}

// ===== TODOS =====
export function getTodos() { return readArr(TODOS_KEY); }

function addTodo(text) {
    const todos = readArr(TODOS_KEY);
    const todo = { id: Date.now(), text, done: false, created: Date.now() };
    todos.push(todo);
    writeArr(TODOS_KEY, todos);
    return todo;
}

function toggleTodo(id) {
    const todos = readArr(TODOS_KEY);
    const t = todos.find(x => x.id === id);
    if (t) { t.done = !t.done; writeArr(TODOS_KEY, todos); return t; }
    return null;
}

function findByText(arr, query) {
    if (!query) return null;
    const q = String(query).toLowerCase().trim();
    return arr.find(item => String(item.text).toLowerCase().includes(q)) || null;
}

// ===== EXECUTE ACTION =====
export async function executeAction(actionName, parameters = {}) {
    try {
        switch (actionName) {

            case 'reminder': {
                const text = parameters.text || 'Reminder';
                const time = parameters.time || '00:00';
                const reminders = readArr(REMINDERS_KEY);
                reminders.push({ id: Date.now(), text, time, created: Date.now() });
                writeArr(REMINDERS_KEY, reminders);
                const perm = await requestNotificationPermission();
                const extra = perm === 'granted' ? '' : ' (Notification permission do, Boss — tab fire kar payenge.)';
                return { success: true, message: `Theek hai Boss, "${text}" ka reminder ${time} baje ke liye set kar diya.${extra}` };
            }

            case 'timer': {
                const seconds = Number(parameters.seconds) || 60;
                const label = parameters.label || 'Timer';
                setTimeout(() => {
                    fireNotification('Mio Timer', `${label} khatam ho gaya, Boss!`);
                }, seconds * 1000);
                return { success: true, message: `${seconds} second ka timer set kar diya, Boss.` };
            }

            case 'search': {
                const query = parameters.query || '';
                if (query) window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
                return { success: true, message: `Google pe search kar rahi hoon: ${query}` };
            }

            case 'time': {
                const now = new Date();
                return { success: true, message: `Abhi ${now.getHours()} baje ${now.getMinutes()} minute hue hain, Boss.` };
            }

            case 'date': {
                const now = new Date();
                const days = ['Ravivaar','Somvaar','Mangalvaar','Budhvaar','Guruvaar','Shukravaar','Shanivaar'];
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                return { success: true, message: `Aaj ${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} hai, Boss.` };
            }

            case 'note_add': {
                const text = parameters.text || '';
                if (!text) return { success: false, message: 'Kya likhna hai, Boss? Bolo.' };
                addNote(text);
                return { success: true, message: `Note save kar liya, Boss: "${text}"` };
            }

            case 'note_list': {
                const notes = readArr(NOTES_KEY);
                if (!notes.length) return { success: true, message: 'Abhi koi note nahi hai, Boss.' };
                const list = notes.slice(-5).map((n, i) => `${i + 1}. ${n.text}`).join(' | ');
                return { success: true, message: `Tumhare ${notes.length} notes hain. Latest: ${list}` };
            }

            case 'note_clear': {
                writeArr(NOTES_KEY, []);
                return { success: true, message: 'Saare notes clear kar diye, Boss.' };
            }

            case 'todo_add': {
                const text = parameters.text || '';
                if (!text) return { success: false, message: 'Kya task add karna hai, Boss?' };
                addTodo(text);
                return { success: true, message: `Task add kar diya, Boss: "${text}"` };
            }

            case 'todo_list': {
                const todos = readArr(TODOS_KEY);
                if (!todos.length) return { success: true, message: 'Todo list khaali hai, Boss.' };
                const list = todos.map((t, i) => `${i + 1}. ${t.done ? '✓' : '○'} ${t.text}`).join(' | ');
                return { success: true, message: `Tumhari todo list: ${list}` };
            }

            case 'todo_done': {
                const query = parameters.text || '';
                const todos = readArr(TODOS_KEY);
                const found = findByText(todos, query);
                if (!found) return { success: false, message: `"${query}" naam ka task nahi mila, Boss.` };
                toggleTodo(found.id);
                return { success: true, message: `Done kar diya, Boss: "${found.text}"` };
            }

            case 'todo_clear': {
                writeArr(TODOS_KEY, []);
                return { success: true, message: 'Poori todo list clear kar di, Boss.' };
            }

            case 'clearHistory': {
                clearHistory();
                return { success: true, message: 'History clear kar di, Boss.' };
            }

            default:
                return { success: false, message: 'Yeh kaam mujhe nahi aata, Boss.' };
        }
    } catch (e) {
        return { success: false, message: 'Kuch problem ho gayi, Boss.' };
    }
}
