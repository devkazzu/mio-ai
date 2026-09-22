// Mio — js/memory.js

const HISTORY_KEY = 'mio_history';
const FACTS_KEY = 'mio_facts';
const MAX_HISTORY = 50;
const BLOCKED = ['raju', 'raju ji'];

function readJSON(key, fallback) {
try {
const raw = localStorage.getItem(key);
if (raw === null) return fallback;
return JSON.parse(raw);
} catch { return fallback; }
}

function writeJSON(key, value) {
try {
localStorage.setItem(key, JSON.stringify(value));
return true;
} catch { return false; }
}

function cleanValue(v) {
return String(v || '').trim().replace(/[.,!?]+$/g, '').replace(/\s+/g, ' ').trim();
}

function isBlocked(name) {
return typeof name === 'string' && BLOCKED.includes(name.trim().toLowerCase());
}

export function saveMessage(role, content) {
if (!['user', 'assistant'].includes(role)) return false;
if (typeof content !== 'string' || !content.trim()) return false;
try {
const history = readJSON(HISTORY_KEY, []);
const arr = Array.isArray(history) ? history : [];
arr.push({ role, content: content.trim(), timestamp: Date.now() });
return writeJSON(HISTORY_KEY, arr.slice(-MAX_HISTORY));
} catch { return false; }
}

export function getHistory(limit = 10) {
try {
const history = readJSON(HISTORY_KEY, []);
if (!Array.isArray(history)) return [];
const n = Math.max(0, Math.floor(Number(limit) || 10));
return history
.filter(m => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string')
.slice(-n)
.map(({ role, content }) => ({ role, content }));
} catch { return []; }
}

export function clearHistory() {
try { localStorage.removeItem(HISTORY_KEY); return true; } catch { return false; }
}

export function setUserFact(key, value) {
if (typeof key !== 'string' || !key.trim()) return false;
const k = key.trim();
if (k.toLowerCase() === 'nickname' && isBlocked(value)) return false;
try {
const facts = readJSON(FACTS_KEY, {});
const obj = facts && typeof facts === 'object' && !Array.isArray(facts) ? facts : {};
obj[k] = value;
return writeJSON(FACTS_KEY, obj);
} catch { return false; }
}

export function getUserFact(key) {
if (typeof key !== 'string') return null;
try {
const facts = readJSON(FACTS_KEY, {});
if (!facts || typeof facts !== 'object') return null;
return Object.prototype.hasOwnProperty.call(facts, key.trim()) ? facts[key.trim()] : null;
} catch { return null; }
}

export function getAllUserFacts() {
try {
const facts = readJSON(FACTS_KEY, {});
return (facts && typeof facts === 'object' && !Array.isArray(facts)) ? { ...facts } : {};
} catch { return {}; }
}

export function getUserNickname() {
try {
const n = getUserFact('nickname');
if (typeof n !== 'string' || !n.trim() || isBlocked(n)) return 'Boss';
return n.trim();
} catch { return 'Boss'; }
}

export function extractFacts(userMessage) {
const saved = [];
if (typeof userMessage !== 'string' || !userMessage.trim()) return saved;
try {
const msg = userMessage.trim();

const patterns = [
/\bmera\s+naam\s+(.+?)\s+hai\b/i,
/\bmujhe\s+(.+?)\s+bulao\b/i
];

for (const p of patterns) {
const m = msg.match(p);
if (!m) continue;
const name = cleanValue(m[1]);
if (name && name.length <= 50 && !isBlocked(name)) {
if (setUserFact('nickname', name)) saved.push({ key: 'nickname', value: name });
}
break;
}

const pref = /\bmujhe\s+(.+?)\s+pasand\s+hai\b/i;
const pm = msg.match(pref);
if (pm) {
const p = cleanValue(pm[1]);
if (p && p.length <= 150 && setUserFact('preference', p)) {
saved.push({ key: 'preference', value: p });
}
}
} catch { /* noop */ }
return saved;
}
