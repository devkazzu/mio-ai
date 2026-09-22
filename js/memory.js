// Mio — js/memory.js

const HISTORY_STORAGE_KEY = 'mio_history';
const FACTS_STORAGE_KEY = 'mio_facts';
const MAX_HISTORY_MESSAGES = 50;
const BLOCKED_NICKNAMES = new Set(['raju', 'raju ji']);

/**
 * Safely reads and parses a JSON value from localStorage.
 * @param {string} key - The localStorage key.
 * @param {*} fallback - Value returned when reading or parsing fails.
 * @returns {*} The parsed value or fallback.
 */
function readStorage(key, fallback) {
    try {
        const rawValue = localStorage.getItem(key);
        if (rawValue === null) {
            return fallback;
        }

        return JSON.parse(rawValue);
    } catch {
        return fallback;
    }
}

/**
 * Safely serializes and writes a value to localStorage.
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
 * Cleans a fact value extracted from a user message.
 * @param {string} value - Raw extracted value.
 * @returns {string} Cleaned value.
 */
function cleanFactValue(value) {
    return String(value || '')
        .trim()
        .replace(/^[“”"'`]+|[“”"'`]+$/g, '')
        .replace(/[.,!?।]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Checks whether a nickname is forbidden.
 * @param {*} nickname - Nickname to check.
 * @returns {boolean} True when the nickname must not be used.
 */
function isBlockedNickname(nickname) {
    if (typeof nickname !== 'string') {
        return false;
    }

    return BLOCKED_NICKNAMES.has(nickname.trim().toLowerCase());
}

/**
 * Appends a message to conversation history and keeps a rolling window.
 * @param {'user'|'assistant'} role - The message author.
 * @param {string} content - The message content.
 * @returns {boolean} Whether the message was saved successfully.
 */
export function saveMessage(role, content) {
    if (!['user', 'assistant'].includes(role) || typeof content !== 'string') {
        return false;
    }

    try {
        const storedHistory = readStorage(HISTORY_STORAGE_KEY, []);
        const history = Array.isArray(storedHistory) ? storedHistory : [];

        history.push({
            role,
            content,
            timestamp: new Date().toISOString()
        });

        return writeStorage(
            HISTORY_STORAGE_KEY,
            history.slice(-MAX_HISTORY_MESSAGES)
        );
    } catch {
        return false;
    }
}

/**
 * Returns the latest messages in OpenAI chat message format.
 * @param {number} [limit=10] - Maximum number of messages to return.
 * @returns {Array<{role: 'user'|'assistant', content: string}>} Chat history.
 */
export function getHistory(limit = 10) {
    try {
        const storedHistory = readStorage(HISTORY_STORAGE_KEY, []);
        if (!Array.isArray(storedHistory)) {
            return [];
        }

        const safeLimit = Number.isFinite(Number(limit))
            ? Math.max(0, Math.floor(Number(limit)))
            : 10;

        return storedHistory
            .filter((message) => (
                message &&
                ['user', 'assistant'].includes(message.role) &&
                typeof message.content === 'string'
            ))
            .slice(-safeLimit)
            .map(({ role, content }) => ({ role, content }));
    } catch {
        return [];
    }
}

/**
 * Removes all saved conversation history.
 * @returns {boolean} Whether the history was cleared successfully.
 */
export function clearHistory() {
    try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

/**
 * Saves or updates a persistent user fact.
 * @param {string} key - Fact key.
 * @param {*} value - Fact value.
 * @returns {boolean} Whether the fact was saved successfully.
 */
export function setUserFact(key, value) {
    if (typeof key !== 'string' || key.trim() === '') {
        return false;
    }

    const normalizedKey = key.trim();

    if (
        normalizedKey.toLowerCase() === 'nickname' &&
        isBlockedNickname(value)
    ) {
        return false;
    }

    try {
        const storedFacts = readStorage(FACTS_STORAGE_KEY, {});
        const facts = (
            storedFacts &&
            typeof storedFacts === 'object' &&
            !Array.isArray(storedFacts)
        ) ? storedFacts : {};

        facts[normalizedKey] = value;
        return writeStorage(FACTS_STORAGE_KEY, facts);
    } catch {
        return false;
    }
}

/**
 * Returns a saved user fact.
 * @param {string} key - Fact key.
 * @returns {*} The saved value, or null when unavailable.
 */
export function getUserFact(key) {
    if (typeof key !== 'string' || key.trim() === '') {
        return null;
    }

    try {
        const storedFacts = readStorage(FACTS_STORAGE_KEY, {});
        if (
            !storedFacts ||
            typeof storedFacts !== 'object' ||
            Array.isArray(storedFacts)
        ) {
            return null;
        }

        const normalizedKey = key.trim();
        return Object.prototype.hasOwnProperty.call(storedFacts, normalizedKey)
            ? storedFacts[normalizedKey]
            : null;
    } catch {
        return null;
    }
}

/**
 * Returns a copy of all saved user facts.
 * @returns {Record<string, *>} All persistent user facts.
 */
export function getAllUserFacts() {
    try {
        const storedFacts = readStorage(FACTS_STORAGE_KEY, {});
        if (
            !storedFacts ||
            typeof storedFacts !== 'object' ||
            Array.isArray(storedFacts)
        ) {
            return {};
        }

        return { ...storedFacts };
    } catch {
        return {};
    }
}

/**
 * Returns the user's preferred nickname, defaulting to "Boss".
 * Forbidden nicknames such as "Raju" and "Raju ji" are never returned.
 * @returns {string} The safe preferred nickname.
 */
export function getUserNickname() {
    try {
        const nickname = getUserFact('nickname');

        if (
            typeof nickname !== 'string' ||
            nickname.trim() === '' ||
            isBlockedNickname(nickname)
        ) {
            return 'Boss';
        }

        return nickname.trim();
    } catch {
        return 'Boss';
    }
}

/**
 * Extracts simple user facts from a message and saves them.
 * Recognizes "mera naam X hai", "mujhe X bulao", and
 * "mujhe X pasand hai" patterns.
 * @param {string} userMessage - The user's message.
 * @returns {Array<{key: string, value: string}>} Newly saved facts.
 */
export function extractFacts(userMessage) {
    const savedFacts = [];

    if (typeof userMessage !== 'string' || userMessage.trim() === '') {
        return savedFacts;
    }

    try {
        const message = userMessage.trim();

        const nicknamePatterns = [
            /\bmera\s+naam\s+(.+?)\s+hai\b/i,
            /\bmujhe\s+(.+?)\s+bulao\b/i
        ];

        for (const pattern of nicknamePatterns) {
            const match = message.match(pattern);
            if (!match) {
                continue;
            }

            const nickname = cleanFactValue(match[1]);
            if (
                nickname &&
                nickname.length <= 50 &&
                !isBlockedNickname(nickname) &&
                setUserFact('nickname', nickname)
            ) {
                savedFacts.push({
                    key: 'nickname',
                    value: nickname
                });
            }

            break;
        }

        const preferencePattern = /\bmujhe\s+(.+?)\s+pasand\s+hai\b/gi;
        let preferenceMatch;

        while ((preferenceMatch = preferencePattern.exec(message)) !== null) {
            const preference = cleanFactValue(preferenceMatch[1]);

            if (
                preference &&
                preference.length <= 150 &&
                setUserFact('preference', preference)
            ) {
                savedFacts.push({
                    key: 'preference',
                    value: preference
                });
            }
        }
    } catch {
        return savedFacts;
    }

    return savedFacts;
}
