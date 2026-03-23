/**
 * Neptun-Lite ICS Parser Engine
 * Validated against Hungarian Neptun ICS format (Python tested)
 * 
 * Features:
 * - Direct fetch from Neptun URL
 * - 24h LocalStorage caching
 * - Europe/Budapest timezone handling
 * - Hungarian field parsing (Előadó, Oktató, Tárgykód, Típus)
 */

// Type mapping for Hungarian event types
const TYPE_MAP = {
    'Előadás': 'lecture',
    'Gyakorlat': 'seminar',
    'Laboratórium': 'lab',
    'Labor': 'lab',
    'Szeminárium': 'seminar',
    'Konzultáció': 'consultation',
    'Vizsga': 'exam',
    'Zárthelyi': 'test'
};

// Regex patterns (validated with Python)
const PATTERNS = {
    event: /BEGIN:VEVENT[\s\S]*?END:VEVENT/g,
    dtstart: /DTSTART(?:;TZID=([^;\r\n]+))?:(\d{8}(?:T\d{6})?)/,
    dtend: /DTEND(?:;TZID=([^;\r\n]+))?:(\d{8}(?:T\d{6})?)/,
    summary: /SUMMARY:([^\r\n]+)/,
    location: /LOCATION:([^\r\n]+)/,
    description: /DESCRIPTION:([^\r\n]+(?:\r?\n[ \t][^\r\n]+)*)/,
    teacher: /(?:Előadó|Oktató):\s*([^\r\n]+)/,
    courseCode: /Tárgykód:\s*([\w]+)/,
    type: /Típus:\s*([\wáéíóöőúüűÁÉÍÓÖŐÚÜŰ]+)/,
    uid: /UID:([^\r\n]+)/,
    rrule: /RRULE:([^\r\n]+)/
};

/**
 * Parse ICS datetime string to Date object
 * @param {string} dtString - ICS datetime (YYYYMMDD or YYYYMMDDTHHMMSS)
 * @param {string} timezone - Timezone identifier
 * @returns {Date} Parsed date object
 */
function parseICSDateTime(dtString, timezone = 'UTC') {
    if (!dtString) return null;
    
    const year = parseInt(dtString.substring(0, 4), 10);
    const month = parseInt(dtString.substring(4, 6), 10) - 1;
    const day = parseInt(dtString.substring(6, 8), 10);
    
    // Date-only format
    if (dtString.length === 8) {
        return new Date(year, month, day);
    }
    
    // DateTime format (YYYYMMDDTHHMMSS)
    if (dtString.length === 15) {
        const hour = parseInt(dtString.substring(9, 11), 10);
        const minute = parseInt(dtString.substring(11, 13), 10);
        const second = parseInt(dtString.substring(13, 15), 10);
        
        // Handle timezone (Europe/Budapest = UTC+1 or UTC+2 DST)
        if (timezone === 'Europe/Budapest') {
            return new Date(year, month, day, hour, minute, second);
        }
        
        return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    
    console.warn('Invalid datetime format:', dtString);
    return null;
}

/**
 * Parse a single VEVENT block
 * @param {string} block - VEVENT content
 * @returns {Object|null} Parsed event object
 */
function parseEvent(block) {
    const event = {};
    
    // Extract DTSTART
    const dtstartMatch = block.match(PATTERNS.dtstart);
    if (dtstartMatch) {
        event.dtstartRaw = dtstartMatch[2];
        event.timezone = dtstartMatch[1] || 'UTC';
        event.start = parseICSDateTime(dtstartMatch[2], event.timezone);
    }
    
    // Extract DTEND
    const dtendMatch = block.match(PATTERNS.dtend);
    if (dtendMatch) {
        event.dtendRaw = dtendMatch[2];
        event.end = parseICSDateTime(dtendMatch[2], event.timezone);
    }
    
    // Extract SUMMARY
    const summaryMatch = block.match(PATTERNS.summary);
    if (summaryMatch) {
        event.summary = summaryMatch[1].trim();
    }
    
    // Extract LOCATION (unescape ICS characters)
    const locationMatch = block.match(PATTERNS.location);
    if (locationMatch) {
        event.location = locationMatch[1]
            .trim()
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';')
            .replace(/\\n/g, ' ');
    }
    
    // Extract DESCRIPTION and parse Hungarian fields
    const descMatch = block.match(PATTERNS.description);
    if (descMatch) {
        const desc = descMatch[1].trim();
        // Handle both literal \n and actual newlines
        event.descriptionRaw = desc.replace(/\\n/g, '\n');
        
        // Extract teacher (Előadó or Oktató) - stop at first newline (literal or actual)
        const teacherMatch = desc.match(/(?:Előadó|Oktató):\s*([^\n\\]+)/);
        if (teacherMatch) {
            event.teacher = teacherMatch[1].trim();
        }
        
        // Extract course code
        const codeMatch = desc.match(PATTERNS.courseCode);
        if (codeMatch) {
            event.courseCode = codeMatch[1];
        }
        
        // Extract type (Hungarian -> English)
        const typeMatch = desc.match(PATTERNS.type);
        if (typeMatch) {
            event.typeHu = typeMatch[1];
            event.type = TYPE_MAP[event.typeHu] || 'other';
        }
    }
    
    // Extract UID
    const uidMatch = block.match(PATTERNS.uid);
    if (uidMatch) {
        event.uid = uidMatch[1].trim();
    }
    
    // Extract RRULE
    const rruleMatch = block.match(PATTERNS.rrule);
    if (rruleMatch) {
        event.rrule = rruleMatch[1].trim();
        
        // Parse recurrence frequency
        const freqMatch = event.rrule.match(/FREQ=(\w+)/);
        if (freqMatch) {
            event.recurrenceFreq = freqMatch[1];
        }
        
        // Parse recurrence day
        const bydayMatch = event.rrule.match(/BYDAY=(\w+)/);
        if (bydayMatch) {
            event.recurrenceDay = bydayMatch[1];
        }
    }
    
    // Calculate duration
    if (event.start && event.end) {
        event.durationMs = event.end - event.start;
        event.durationMinutes = Math.floor(event.durationMs / 60000);
    }
    
    return event;
}

/**
 * Parse full ICS content
 * @param {string} content - Raw ICS file content
 * @returns {Array} Array of parsed events
 */
function parseICS(content) {
    if (!content || typeof content !== 'string') {
        console.error('Invalid ICS content');
        return [];
    }
    
    const events = [];
    const eventMatches = content.match(PATTERNS.event);
    
    if (!eventMatches) {
        console.warn('No events found in ICS content');
        return [];
    }
    
    for (const block of eventMatches) {
        const event = parseEvent(block);
        if (event && event.start) {
            events.push(event);
        }
    }
    
    // Sort by start time
    events.sort((a, b) => a.start - b.start);
    
    return events;
}

/**
 * Cache management (24h localStorage caching)
 */
const CACHE_KEY = 'neptun_calendar_data';
const CACHE_TIMESTAMP_KEY = 'neptun_calendar_timestamp';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch and cache ICS data
 * Uses PHP proxy on InfinityFree to bypass CORS restrictions
 * @param {string} url - Neptun ICS URL
 * @returns {Promise<Array>} Parsed events
 */
async function fetchCalendar(url) {
    if (!url) {
        throw new Error('Calendar URL is required');
    }

    try {
        // Clean URL - trim whitespace
        const cleanUrl = url.trim();
        
        // Use PHP proxy to bypass CORS
        const proxyUrl = 'fetch-ics.php?url=' + encodeURIComponent(cleanUrl);
        
        console.log('[ICS] Fetching via proxy:', proxyUrl.substring(0, 80) + '...');

        const response = await fetch(proxyUrl, {
            method: 'GET',
            cache: 'no-cache'
        });

        console.log('[ICS] Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse JSON response from PHP proxy
        const data = await response.json();
        
        console.log('[ICS] Proxy response:', data.success ? 'success' : 'error');

        if (!data.success) {
            throw new Error(data.error || 'Proxy fetch failed');
        }

        const content = data.content;
        
        console.log('[ICS] Content length:', content.length);

        // Validate ICS content
        if (!content.includes('BEGIN:VCALENDAR') || !content.includes('END:VCALENDAR')) {
            throw new Error('Invalid ICS file format - missing VCALENDAR');
        }

        const events = parseICS(content);

        console.log('[ICS] Parsed', events.length, 'events');

        // Cache the data
        cacheData(content, events);

        return events;
    } catch (error) {
        console.error('Failed to fetch calendar:', error);

        // Try to load from cache
        const cached = getCachedData();
        if (cached) {
            console.log('Loaded from cache (fetch failed)');
            return cached.events;
        }

        throw error;
    }
}

/**
 * Get cached data from localStorage
 * @returns {Object|null} Cached data or null
 */
function getCachedData() {
    try {
        const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        const content = localStorage.getItem(CACHE_KEY);
        
        if (!timestamp || !content) {
            return null;
        }
        
        // Check if cache is expired
        const age = Date.now() - parseInt(timestamp, 10);
        if (age > CACHE_DURATION) {
            console.log('Cache expired');
            return null;
        }
        
        return {
            timestamp: parseInt(timestamp, 10),
            content: content,
            events: parseICS(content)
        };
    } catch (error) {
        console.error('Cache read error:', error);
        return null;
    }
}

/**
 * Cache data to localStorage
 * @param {string} content - Raw ICS content
 * @param {Array} events - Parsed events
 */
function cacheData(content, events) {
    try {
        localStorage.setItem(CACHE_KEY, content);
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        console.log('Calendar data cached');
    } catch (error) {
        console.error('Cache write error:', error);
    }
}

/**
 * Clear cached data
 */
function clearCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
        console.log('Cache cleared');
    } catch (error) {
        console.error('Cache clear error:', error);
    }
}

/**
 * Get events for a specific date
 * @param {Date} date - Target date
 * @param {Array} events - All events
 * @returns {Array} Events for the specified date
 */
function getEventsForDate(date, events) {
    const targetYear = date.getFullYear();
    const targetMonth = date.getMonth();
    const targetDay = date.getDate();
    
    return events.filter(event => {
        if (!event.start) return false;
        return (
            event.start.getFullYear() === targetYear &&
            event.start.getMonth() === targetMonth &&
            event.start.getDate() === targetDay
        );
    });
}

/**
 * Format time for display (Hungarian locale)
 * @param {Date} date - Date object
 * @returns {string} Formatted time (HH:MM)
 */
function formatTime(date) {
    return date.toLocaleTimeString('hu-HU', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format date for display (Hungarian locale)
 * @param {Date} date - Date object
 * @returns {string} Formatted date (YYYY. MM. DD.)
 */
function formatDate(date) {
    return date.toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
}

/**
 * Format date compact for display
 * @param {Date} date - Date object
 * @returns {string} Compact date (MM.DD | Day)
 */
function formatDateCompact(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekday = date.toLocaleDateString('hu-HU', { weekday: 'short' });
    return `${month}.${day} | ${weekday}`;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseICS,
        parseEvent,
        parseICSDateTime,
        fetchCalendar,
        getCachedData,
        clearCache,
        getEventsForDate,
        formatTime,
        formatDate,
        formatDateCompact,
        TYPE_MAP,
        PATTERNS
    };
}

// Make functions available globally for browser
if (typeof window !== 'undefined') {
    window.parseICS = parseICS;
    window.parseEvent = parseEvent;
    window.parseICSDateTime = parseICSDateTime;
    window.fetchCalendar = fetchCalendar;
    window.getCachedData = getCachedData;
    window.clearCache = clearCache;
    window.getEventsForDate = getEventsForDate;
    window.formatTime = formatTime;
    window.formatDate = formatDate;
    window.formatDateCompact = formatDateCompact;
    window.TYPE_MAP = TYPE_MAP;
    window.PATTERNS = PATTERNS;
}
