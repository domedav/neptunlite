/**
 * Neptun-Lite V2 - IndexedDB Storage
 * Multiple calendar support with persistent storage
 */

const DB_NAME = 'neptun-lite-v2';
const DB_VERSION = 1;
const STORE_NAME = 'calendars';

/**
 * Open database connection
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('[DB] Error opening database:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object store if it doesn't exist
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                
                // Create index for URL lookup
                store.createIndex('url', 'url', { unique: true });
                store.createIndex('enabled', 'enabled', { unique: false });
            }
        };
    });
}

/**
 * Add a new calendar
 * @param {Object} calendar - Calendar data {url, name, color, enabled}
 * @returns {Promise<number>} Calendar ID
 */
async function addCalendar(calendar) {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const calendarData = {
            url: calendar.url,
            name: calendar.name || `Naptár ${new Date().toLocaleDateString('hu-HU')}`,
            color: calendar.color || '#6366f1',
            enabled: calendar.enabled !== false,
            lastFetched: null,
            createdAt: new Date().toISOString()
        };
        
        const request = store.add(calendarData);
        
        request.onsuccess = () => {
            console.log('[DB] Calendar added:', request.result);
            resolve(request.result);
        };
        
        request.onerror = () => {
            if (request.error.name === 'ConstraintError') {
                reject(new Error('Ez a naptár már hozzá van adva'));
            } else {
                console.error('[DB] Error adding calendar:', request.error);
                reject(request.error);
            }
        };
    });
}

/**
 * Get all calendars
 * @returns {Promise<Array>} Array of calendar objects
 */
async function getAllCalendars() {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            resolve(request.result || []);
        };
        
        request.onerror = () => {
            console.error('[DB] Error getting calendars:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Get a single calendar by ID
 * @param {number} id - Calendar ID
 * @returns {Promise<Object>} Calendar object
 */
async function getCalendar(id) {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('[DB] Error getting calendar:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Update a calendar
 * @param {Object} calendar - Calendar data with id
 * @returns {Promise<void>}
 */
async function updateCalendar(calendar) {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.put(calendar);
        
        request.onsuccess = () => {
            console.log('[DB] Calendar updated:', calendar.id);
            resolve();
        };
        
        request.onerror = () => {
            console.error('[DB] Error updating calendar:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Delete a calendar
 * @param {number} id - Calendar ID
 * @returns {Promise<void>}
 */
async function deleteCalendar(id) {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.delete(id);
        
        request.onsuccess = () => {
            console.log('[DB] Calendar deleted:', id);
            resolve();
        };
        
        request.onerror = () => {
            console.error('[DB] Error deleting calendar:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Toggle calendar enabled state
 * @param {number} id - Calendar ID
 * @param {boolean} enabled - New enabled state
 * @returns {Promise<void>}
 */
async function toggleCalendarEnabled(id, enabled) {
    const calendar = await getCalendar(id);
    if (calendar) {
        calendar.enabled = enabled;
        await updateCalendar(calendar);
    }
}

/**
 * Update last fetched timestamp
 * @param {number} id - Calendar ID
 * @returns {Promise<void>}
 */
async function updateLastFetched(id) {
    const calendar = await getCalendar(id);
    if (calendar) {
        calendar.lastFetched = new Date().toISOString();
        await updateCalendar(calendar);
    }
}

/**
 * Get enabled calendars only
 * @returns {Promise<Array>} Array of enabled calendar objects
 */
async function getEnabledCalendars() {
    const calendars = await getAllCalendars();
    return calendars.filter(cal => cal.enabled);
}

/**
 * Clear all calendars (for testing/debugging)
 * @returns {Promise<void>}
 */
async function clearAllCalendars() {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.clear();
        
        request.onsuccess = () => {
            console.log('[DB] All calendars cleared');
            resolve();
        };
        
        request.onerror = () => {
            console.error('[DB] Error clearing calendars:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Export calendar data (for backup)
 * @returns {Promise<Object>} All calendar data
 */
async function exportCalendars() {
    const calendars = await getAllCalendars();
    return {
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        calendars: calendars
    };
}

/**
 * Import calendar data (from backup)
 * @param {Object} data - Exported data
 * @returns {Promise<number>} Number of calendars imported
 */
async function importCalendars(data) {
    if (!data || !data.calendars || !Array.isArray(data.calendars)) {
        throw new Error('Invalid import data');
    }
    
    let count = 0;
    for (const calendar of data.calendars) {
        try {
            await addCalendar({
                url: calendar.url,
                name: calendar.name,
                color: calendar.color,
                enabled: calendar.enabled
            });
            count++;
        } catch (error) {
            console.warn('[DB] Skipping duplicate calendar:', calendar.url);
        }
    }
    
    return count;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openDB,
        addCalendar,
        getAllCalendars,
        getCalendar,
        updateCalendar,
        deleteCalendar,
        toggleCalendarEnabled,
        updateLastFetched,
        getEnabledCalendars,
        clearAllCalendars,
        exportCalendars,
        importCalendars
    };
}

// Make available globally for browser
if (typeof window !== 'undefined') {
    window.NeptunDB = {
        addCalendar,
        getAllCalendars,
        getCalendar,
        updateCalendar,
        deleteCalendar,
        toggleCalendarEnabled,
        updateLastFetched,
        getEnabledCalendars,
        clearAllCalendars,
        exportCalendars,
        importCalendars
    };
}
