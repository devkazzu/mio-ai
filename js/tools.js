// Mio — js/tools.js

import { clearHistory } from './memory.js';

const REMINDERS_KEY = 'mio_reminders';

function readReminders() {
try {
const raw = localStorage.getItem(REMINDERS_KEY);
if (!raw) return [];
const arr = JSON.parse(raw);
return Array.isArray(arr) ? arr : [];
} catch { return []; }
}

function writeReminders(arr) {
try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(arr)); return true; }
catch { return false; }
}

export function getReminders() {
return readReminders();
}

export function clearReminders() {
try { localStorage.removeItem(REMINDERS_KEY); return true; } catch { return false; }
}

export async function executeAction(actionName, parameters = {}) {
try {
switch (actionName) {
case 'reminder': {
const text = parameters.text || 'Reminder';
const time = parameters.time || '00:00';
const reminders = readReminders();
reminders.push({ text, time, created: Date.now() });
writeReminders(reminders);
return { success: true, message: `Theek hai Boss, "${text}" ka reminder ${time} baje ke liye set kar diya.` };
}

case 'timer': {
const seconds = Number(parameters.seconds) || 60;
const label = parameters.label || 'Timer';
setTimeout(() => {
if ('Notification' in window && Notification.permission === 'granted') {
new Notification('Mio', { body: `${label} khatam ho gaya, Boss!` });
}
}, seconds * 1000);
return { success: true, message: `${seconds} second ka timer set kar diya, Boss.` };
}

case 'search': {
const query = parameters.query || '';
if (query && typeof window !== 'undefined') {
window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
}
return { success: true, message: `Google pe search kar rahi hoon: ${query}` };
}

case 'time': {
const now = new Date();
const h = now.getHours();
const m = now.getMinutes();
return { success: true, message: `Abhi ${h} baje ${m} minute hue hain, Boss.` };
}

case 'date': {
const now = new Date();
const days = ['Ravivaar','Somvaar','Mangalvaar','Budhvaar','Guruvaar','Shukravaar','Shanivaar'];
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
return { success: true, message: `Aaj ${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} hai, Boss.` };
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
