// Mio — js/tools.js

import { clearHistory, getUserFact, setUserFact } from './memory.js';

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
    try { return await Notification.requestPermission(); }
    catch { return 'error'; }
}

function fireNotification(title, body) {
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: 'icons/icon-192.png' });
        }
    } catch { /* noop */ }
}

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

// ===== WEATHER (Open-Meteo — free, no key needed) =====
async function fetchWeather(city) {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`);
    const geo = await geoRes.json();
    if (!geo.results || !geo.results.length) {
        throw new Error('City not found');
    }
    const place = geo.results[0];
    const lat = place.latitude;
    const lon = place.longitude;
    const name = place.name;
    const country = place.country || '';

    const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
    const w = await wRes.json();
    const c = w.current;

    return {
        city: name,
        country,
        temp: c.temperature_2m,
        humidity: c.relative_humidity_2m,
        wind: c.wind_speed_10m,
        code: c.weather_code
    };
}

function weatherDescription(code) {
    const map = {
        0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
        45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
        61: 'light rain', 63: 'rain', 65: 'heavy rain',
        71: 'light snow', 73: 'snow', 75: 'heavy snow',
        80: 'rain showers', 81: 'rain showers', 82: 'heavy showers',
        95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm'
    };
    return map[code] || 'normal weather';
}

// ===== CALCULATOR (safe eval) =====
function safeCalculate(expression) {
    const cleaned = String(expression).replace(/[^0-9+\-*/().%\s]/g, '');
    if (!cleaned.trim()) throw new Error('Invalid');
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${cleaned})`)();
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('Bad result');
    return result;
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
                const extra = perm === 'granted' ? '' : ' (Notification permission do, Boss.)';
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
                if (!text) return { success: false, message: 'Kya likhna hai, Boss?' };
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

            case 'weather': {
                let city = parameters.city || '';
                if (!city) {
                    city = getUserFact('city') || '';
                }
                if (!city) {
                    return { success: false, message: 'Kis sheher ka mausam chahiye, Boss? Bolo — jaise "Delhi ka mausam".' };
                }
                try {
                    const w = await fetchWeather(city);
                    const desc = weatherDescription(w.code);
                    return {
                        success: true,
                        message: `${w.city} mein abhi ${w.temp}°C hai, ${desc}. Humidity ${w.humidity}% aur hawa ${w.wind} km/h chal rahi hai, Boss.`
                    };
                } catch (e) {
                    return { success: false, message: `"${city}" naam ka sheher nahi mila, Boss.` };
                }
            }

            case 'calculate': {
                const expr = parameters.expression || '';
                if (!expr) return { success: false, message: 'Kya calculate karna hai, Boss?' };
                try {
                    const result = safeCalculate(expr);
                    return { success: true, message: `${expr} ka jawab ${result} hai, Boss.` };
                } catch {
                    return { success: false, message: 'Yeh calculation samajh nahi aayi, Boss.' };
                }
            }

            case 'translate': {
                const text = parameters.text || '';
                const to = parameters.to || 'Hindi';
                if (!text) return { success: false, message: 'Kya translate karna hai, Boss?' };
                return { success: true, message: `Translation: "${text}" ko ${to} mein Mio ke LLM se karwa rahi hoon — bas prompt mein hi aata hai.` };
            }

            case 'convert': {
                const value = Number(parameters.value);
                const from = String(parameters.from || '').toLowerCase();
                const to = String(parameters.to || '').toLowerCase();

                if (!value || !from || !to) {
                    return { success: false, message: 'Value, from aur to batao, Boss.' };
                }

                const toKm = { km: 1, mile: 1.60934, miles: 1.60934, m: 0.001, meter: 0.001, ft: 0.0003048, feet: 0.0003048 };
                const toKg = { kg: 1, g: 0.001, gram: 0.001, lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592 };

                let result = null;

                if (from in toKm && to in toKm) {
                    const meters = value * toKm[from];
                    result = meters / toKm[to];
                } else if (from in toKg && to in toKg) {
                    const kg = value * toKg[from];
                    result = kg / toKg[to];
                } else if (from === 'c' && to === 'f') {
                    result = (value * 9/5) + 32;
                } else if (from === 'f' && to === 'c') {
                    result = (value - 32) * 5/9;
                }

                if (result === null) {
                    return { success: false, message: 'Yeh conversion mujhe nahi aata, Boss.' };
                }

                return { success: true, message: `${value} ${from} = ${result.toFixed(2)} ${to}, Boss.` };
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
