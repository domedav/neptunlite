/**
 * Neptun-Lite V2 - Main Application
 * Proper state machine: LOADING → ICS_MODAL → CALENDAR
 */

// App States (mutually exclusive)
const STATE_LOADING = 'loading';
const STATE_ICS_MODAL = 'ics_modal';
const STATE_CALENDAR = 'calendar';

// Modal Types (only 1 at a time)
const MODAL_NONE = null;
const MODAL_ADD_ICS = 'add_ics';
const MODAL_MANAGE = 'manage';
const MODAL_EVENT = 'event';
const MODAL_PWA_INSTALL = 'pwa_install';
const MODAL_FIRSTTIME = 'firsttime';

// Application State
const AppState = {
    currentState: STATE_LOADING,
    currentModal: MODAL_NONE,
    calendars: [],
    events: [],
    currentView: 'day',
    currentDate: new Date(),
    selectedColor: '#6366f1',
    deferredPrompt: null,
    lastActivity: Date.now(),
    activityTimer: null,
    eventTimer: null,
    notificationTimer: null,
    isLoading: false,
    actionDebounce: {},
    notificationsEnabled: false,
    notifiedEvents: new Set()
};

// Debounce delays (ms)
const DEBOUNCE_DELAY = 300;
const ACTION_TIMEOUT = 30000; // 30 second max timeout
const AUTO_RELOAD_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Show loading overlay
 */
function showLoadingOverlay(message = 'Betöltés...') {
    AppState.isLoading = true;
    
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-overlay-content">
                <div class="loading-spinner-large"></div>
                <p class="loading-overlay-text">${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('.loading-overlay-text').textContent = message;
        overlay.classList.add('visible');
    }
    
    // Auto-hide after timeout
    if (AppState.loadingTimeout) {
        clearTimeout(AppState.loadingTimeout);
    }
    AppState.loadingTimeout = setTimeout(() => {
        hideLoadingOverlay();
    }, ACTION_TIMEOUT);
}

/**
 * Hide loading overlay
 */
function hideLoadingOverlay() {
    AppState.isLoading = false;
    
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.remove();
            }
        }, 300);
    }
    
    if (AppState.loadingTimeout) {
        clearTimeout(AppState.loadingTimeout);
        AppState.loadingTimeout = null;
    }
}

/**
 * Debounce function - prevents rapid repeated calls
 */
function debounce(actionId, callback, delay = DEBOUNCE_DELAY) {
    // Clear existing timeout for this action
    if (AppState.actionDebounce[actionId]) {
        clearTimeout(AppState.actionDebounce[actionId]);
    }
    
    // Set new timeout
    AppState.actionDebounce[actionId] = setTimeout(() => {
        callback();
        delete AppState.actionDebounce[actionId];
    }, delay);
}

/**
 * Execute action with loading state and debounce
 */
function withLoading(actionId, actionFn, loadingMessage = 'Betöltés...') {
    return new Promise((resolve, reject) => {
        // Check if already loading
        if (AppState.isLoading) {
            console.log('[App] Action blocked - already loading:', actionId);
            return;
        }
        
        // Debounce the action
        debounce(actionId, async () => {
            showLoadingOverlay(loadingMessage);
            
            try {
                const result = await actionFn();
                resolve(result);
            } catch (error) {
                reject(error);
            } finally {
                setTimeout(() => {
                    hideLoadingOverlay();
                }, 500); // Small delay for smooth UX
            }
        }, 50); // Short debounce for immediate feedback
    });
}

// DOM Cache
const DOM = {};

/**
 * Initialize the application
 */
async function initApp() {
    console.log('[App] Initializing...');

    // Check if we should reload due to inactivity
    checkAutoReload();

    // Cache all DOM elements first
    cacheDOM();

    // Setup event listeners
    setupEventListeners();

    // Setup pull-to-refresh
    setupPullToRefresh();

    // Setup PWA install prompt
    setupPWAInstallPrompt();

    // Start in LOADING state
    setState(STATE_LOADING);

    // Load calendars from IndexedDB
    await loadCalendars();

    // Decide next state based on whether we have calendars
    if (AppState.calendars.length === 0) {
        // No calendars - show mandatory first-time setup modal
        setState(STATE_ICS_MODAL);
        showModal(MODAL_FIRSTTIME, { mandatory: true });
        setupFirstTimeModal();
    } else {
        // Have calendars - show calendar view
        setState(STATE_CALENDAR);
        await loadAllEvents();
        // Start event timer for active event countdown
        startEventTimer();
        // Start notification checker for upcoming events
        startNotificationChecker();
    }

    console.log('[App] Ready. State:', AppState.currentState);
}

/**
 * Set app state (mutually exclusive states)
 */
function setState(newState) {
    console.log('[App] State change:', AppState.currentState, '→', newState);
    
    AppState.currentState = newState;
    
    // Hide everything first
    DOM.loading.hidden = true;
    DOM.app.hidden = true;
    hideAllModals();
    
    // Show appropriate content based on state
    switch (newState) {
        case STATE_LOADING:
            DOM.loading.hidden = false;
            DOM.app.hidden = true;
            break;
            
        case STATE_ICS_MODAL:
            DOM.loading.hidden = true;
            DOM.app.hidden = false;
            // Modal will be shown by showModal()
            break;
            
        case STATE_CALENDAR:
            DOM.loading.hidden = true;
            DOM.app.hidden = false;
            break;
    }
    
    updateDebug();
}

/**
 * Show a modal (only 1 at a time)
 */
function showModal(modalType, options = {}) {
    console.log('[App] Show modal:', modalType, options);
    
    // Hide all modals first
    hideAllModals();
    
    AppState.currentModal = modalType;
    
    const modal = getModalElement(modalType);
    if (!modal) {
        console.error('[App] Unknown modal:', modalType);
        return;
    }
    
    modal.hidden = false;
    modal.setAttribute('open', '');
    
    // Store if this is a mandatory modal
    if (options.mandatory) {
        modal.dataset.mandatory = 'true';
    } else {
        delete modal.dataset.mandatory;
    }
    
    updateDebug();
}

/**
 * Hide a specific modal
 */
function hideModal(modalType) {
    const modal = getModalElement(modalType);
    if (modal) {
        // Don't hide mandatory modals
        if (modal.dataset.mandatory === 'true') {
            console.log('[App] Cannot close mandatory modal');
            return false;
        }
        
        modal.hidden = true;
        modal.removeAttribute('open');
        AppState.currentModal = MODAL_NONE;
        updateDebug();
        return true;
    }
    return false;
}

/**
 * Hide all modals
 */
function hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.hidden = true;
        modal.removeAttribute('open');
        delete modal.dataset.mandatory;
    });
    AppState.currentModal = MODAL_NONE;
}

/**
 * Get modal element by type
 */
function getModalElement(modalType) {
    const modalMap = {
        [MODAL_ADD_ICS]: 'add-calendar-modal',
        [MODAL_MANAGE]: 'manage-calendars-modal',
        [MODAL_EVENT]: 'event-details-modal',
        [MODAL_PWA_INSTALL]: 'pwa-install-modal',
        [MODAL_FIRSTTIME]: 'firsttime-setup-modal'
    };
    const id = modalMap[modalType];
    return id ? document.getElementById(id) : null;
}

/**
 * Cache DOM elements
 */
function cacheDOM() {
    DOM.loading = document.getElementById('loading');
    DOM.app = document.getElementById('app');
    DOM.mainContent = document.getElementById('main-content');
    DOM.viewBtns = document.querySelectorAll('.view-btn');
    DOM.dayView = document.getElementById('day-view');
    DOM.weekView = document.getElementById('week-view');
    DOM.monthView = document.getElementById('month-view');
    DOM.dayEvents = document.getElementById('day-events');
    DOM.dayEmpty = document.getElementById('day-empty');
    DOM.weekContent = document.getElementById('week-content');
    DOM.monthContent = document.getElementById('month-content');
    DOM.currentPeriod = document.getElementById('current-period');
    DOM.prevBtn = document.getElementById('prev-period');
    DOM.nextBtn = document.getElementById('next-period');
    DOM.todayBtn = document.getElementById('today-btn');
    DOM.addCalendarBtn = document.getElementById('add-calendar-btn');
    DOM.manageCalendarsBtn = document.getElementById('manage-calendars-btn');
    DOM.addCalendarForm = document.getElementById('add-calendar-form');
    DOM.calendarsList = document.getElementById('calendars-list');
    DOM.colorOptions = document.querySelectorAll('.color-option');
    DOM.ptrIndicator = document.getElementById('ptr-indicator');
    DOM.errorContainer = document.getElementById('error-container');
    DOM.errorMessage = document.getElementById('error-message');
    DOM.errorDismiss = document.getElementById('error-dismiss');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Track user activity for auto-reload
    trackActivity();
    
    // Error dismiss button
    if (DOM.errorDismiss) {
        DOM.errorDismiss.addEventListener('click', () => {
            hideError();
        });
    }
    
    // View toggle (debounced)
    DOM.viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            trackActivity();
            debounce('view-toggle', () => {
                switchView(btn.dataset.view);
            });
        });
    });

    // Navigation (debounced)
    DOM.prevBtn.addEventListener('click', () => {
        trackActivity();
        debounce('nav-prev', () => {
            navigatePeriod(-1);
        });
    });
    DOM.nextBtn.addEventListener('click', () => {
        trackActivity();
        debounce('nav-next', () => {
            navigatePeriod(1);
        });
    });
    DOM.todayBtn.addEventListener('click', () => {
        trackActivity();
        debounce('nav-today', () => {
            goToToday();
        });
    });

    // Modal triggers (debounced)
    DOM.addCalendarBtn.addEventListener('click', () => {
        trackActivity();
        debounce('modal-add', () => {
            showModal(MODAL_ADD_ICS);
        });
    });

    DOM.manageCalendarsBtn.addEventListener('click', () => {
        trackActivity();
        debounce('modal-manage', () => {
            openManageCalendarsModal();
        });
    });

    // Event card clicks (event delegation for day view)
    DOM.mainContent.addEventListener('click', (e) => {
        const eventCard = e.target.closest('.event-card-clickable');
        if (eventCard && eventCard.dataset.eventId) {
            trackActivity();
            const eventId = eventCard.dataset.eventId;
            window.showEventDetails(eventId);
        }
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            trackActivity();
            e.stopPropagation();
            const modal = btn.closest('.modal');
            const modalId = modal?.id;
            const modalType = getModalTypeFromId(modalId);
            hideModal(modalType);
        });
    });

    document.querySelectorAll('.modal-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            trackActivity();
            e.stopPropagation();
            const modal = btn.closest('.modal');
            const modalId = modal?.id;
            const modalType = getModalTypeFromId(modalId);
            hideModal(modalType);
        });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            trackActivity();
            const modal = e.target.closest('.modal');
            const modalId = modal?.id;
            const modalType = getModalTypeFromId(modalId);
            hideModal(modalType);
        });
    });

    // Add calendar form (with loading)
    DOM.addCalendarForm.addEventListener('submit', (e) => {
        e.preventDefault();
        withLoading('add-calendar', () => handleAddCalendar(e), 'Naptár hozzáadása...');
    });

    // Color picker
    DOM.colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            trackActivity();
            DOM.colorOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            AppState.selectedColor = option.dataset.color;
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Theme change listener
    setupThemeListener();

    // Notifications toggle (debounced)
    const notificationsToggle = document.getElementById('notifications-toggle');
    if (notificationsToggle) {
        notificationsToggle.addEventListener('click', () => {
            debounce('notifications-toggle', async () => {
                const isEnabled = notificationsToggle.getAttribute('aria-pressed') === 'true';
                const newState = !isEnabled;

                if (newState) {
                    // Check if notifications are supported
                    if (!('Notification' in window)) {
                        showNotificationWarning('Az értesítések nem támogatottak ezen az eszközön.');
                        return;
                    }

                    // Request permission
                    const granted = await requestNotificationPermission();
                    if (granted) {
                        notificationsToggle.setAttribute('aria-pressed', 'true');
                        localStorage.setItem('neptun_notificationsEnabled', 'true');
                        AppState.notificationsEnabled = true;
                        startNotificationChecker();
                        showSuccess('Értesítések bekapcsolva');
                    } else {
                        // Permission denied - show warning
                        notificationsToggle.setAttribute('aria-pressed', 'false');
                        showNotificationWarning('Az értesítések engedélyezése megtagadva. Engedélyezd a böngésző beállításaiban.');
                    }
                } else {
                    // Disable notifications
                    notificationsToggle.setAttribute('aria-pressed', 'false');
                    localStorage.setItem('neptun_notificationsEnabled', 'false');
                    AppState.notificationsEnabled = false;
                    stopNotificationChecker();
                    showSuccess('Értesítések kikapcsolva');
                }
            }, 500);
        });
    }
}

/**
 * Show notification warning in manage modal
 */
function showNotificationWarning(message) {
    const warning = document.getElementById('notification-warning');
    if (warning) {
        warning.hidden = false;
        warning.querySelector('.warning-text').textContent = message;
    }
    // Open manage modal if not already open
    if (AppState.currentModal !== MODAL_MANAGE) {
        openManageCalendarsModal();
    }
}

/**
 * Show error or success message
 * @param {string} message - Message to display
 * @param {boolean} isSuccess - If true, shows as success (green)
 */
function showError(message, isSuccess = false) {
    if (DOM.errorContainer && DOM.errorMessage) {
        DOM.errorMessage.textContent = message;
        DOM.errorContainer.hidden = false;
        
        // Toggle success/error styling
        if (isSuccess) {
            DOM.errorContainer.classList.add('success');
            DOM.errorContainer.querySelector('.error-icon').innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            `;
        } else {
            DOM.errorContainer.classList.remove('success');
            DOM.errorContainer.querySelector('.error-icon').innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            `;
        }

        // Auto-hide after 10 seconds (3 seconds for success)
        setTimeout(() => {
            hideError();
        }, isSuccess ? 3000 : 10000);
    }
    if (!isSuccess) {
        console.error('[App] Error:', message);
    }
}

/**
 * Show success message (shortcut)
 */
function showSuccess(message) {
    showError(message, true);
}

/**
 * Hide error message
 */
function hideError() {
    if (DOM.errorContainer) {
        DOM.errorContainer.hidden = true;
    }
}

/**
 * Track user activity for auto-reload
 */
function trackActivity() {
    AppState.lastActivity = Date.now();
    localStorage.setItem('neptun_lastActivity', Date.now().toString());
}

/**
 * Check if we should reload due to inactivity
 */
function checkAutoReload() {
    const lastActivity = parseInt(localStorage.getItem('neptun_lastActivity') || Date.now().toString(), 10);
    const inactiveTime = Date.now() - lastActivity;
    
    if (inactiveTime > AUTO_RELOAD_MS) {
        console.log('[App] Reloading after', Math.round(inactiveTime / 60000), 'minutes of inactivity');
        window.location.reload();
    }
}

/**
 * Setup theme change listener
 */
function setupThemeListener() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        console.log('[Theme] System theme changed to', e.matches ? 'dark' : 'light');
    });
}

/**
 * Get modal type from ID
 */
function getModalTypeFromId(id) {
    const typeMap = {
        'add-calendar-modal': MODAL_ADD_ICS,
        'manage-calendars-modal': MODAL_MANAGE,
        'event-details-modal': MODAL_EVENT,
        'pwa-install-modal': MODAL_PWA_INSTALL,
        'firsttime-setup-modal': MODAL_FIRSTTIME
    };
    return typeMap[id];
}

/**
 * Switch calendar view
 */
function switchView(viewName) {
    AppState.currentView = viewName;

    // Update button states
    DOM.viewBtns.forEach(btn => {
        const isActive = btn.dataset.view === viewName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive);
    });

    // Hide all views and remove active class
    DOM.dayView.hidden = true;
    DOM.weekView.hidden = true;
    DOM.monthView.hidden = true;
    DOM.dayView.classList.remove('active');
    DOM.weekView.classList.remove('active');
    DOM.monthView.classList.remove('active');
    
    // Show only the selected view and add active class
    if (viewName === 'day') {
        DOM.dayView.hidden = false;
        DOM.dayView.classList.add('active');
    } else if (viewName === 'week') {
        DOM.weekView.hidden = false;
        DOM.weekView.classList.add('active');
    } else if (viewName === 'month') {
        DOM.monthView.hidden = false;
        DOM.monthView.classList.add('active');
    }

    renderCurrentView();
}

/**
 * Navigate period
 */
function navigatePeriod(delta) {
    const date = AppState.currentDate;
    
    switch (AppState.currentView) {
        case 'day':
            date.setDate(date.getDate() + delta);
            break;
        case 'week':
            date.setDate(date.getDate() + (delta * 7));
            break;
        case 'month':
            date.setMonth(date.getMonth() + delta);
            break;
    }
    
    AppState.currentDate = date;
    renderCurrentView();
}

/**
 * Go to today
 */
function goToToday() {
    AppState.currentDate = new Date();
    renderCurrentView();
}

/**
 * Render current view
 */
function renderCurrentView() {
    updatePeriodLabel();
    
    switch (AppState.currentView) {
        case 'day':
            renderDayView();
            break;
        case 'week':
            renderWeekView();
            break;
        case 'month':
            renderMonthView();
            break;
    }
}

/**
 * Update period label
 */
function updatePeriodLabel() {
    const date = AppState.currentDate;
    const options = { year: 'numeric', month: 'long' };
    
    switch (AppState.currentView) {
        case 'day':
            DOM.currentPeriod.textContent = date.toLocaleDateString('hu-HU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            break;
        case 'week':
            const weekStart = getWeekStart(date);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 4);
            options.day = 'numeric';
            DOM.currentPeriod.textContent = `${weekStart.toLocaleDateString('hu-HU', options)} - ${weekEnd.toLocaleDateString('hu-HU', options)}`;
            break;
        case 'month':
            DOM.currentPeriod.textContent = date.toLocaleDateString('hu-HU', options);
            break;
    }
}

/**
 * Render day view
 */
function renderDayView() {
    const dayEvents = getEventsForDate(AppState.currentDate, AppState.events);
    
    if (dayEvents.length === 0) {
        DOM.dayEvents.innerHTML = '';
        DOM.dayEmpty.hidden = false;
    } else {
        DOM.dayEmpty.hidden = true;
        DOM.dayEvents.innerHTML = dayEvents.map(event => createEventCard(event, true)).join('');
    }
}

/**
 * Render week view - Card-based layout like daily view
 */
function renderWeekView() {
    const weekStart = getWeekStart(AppState.currentDate);
    const days = [];

    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        days.push(day);
    }

    DOM.weekContent.innerHTML = days.map(day => {
        const dayEvents = getEventsForDate(day, AppState.events);
        const isToday = isSameDay(day, new Date());
        const dayName = day.toLocaleDateString('hu-HU', { weekday: 'short' });
        const dayDate = day.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
        const dayTimestamp = day.getTime();

        return `
            <div class="week-day-card ${dayEvents.length > 0 ? 'has-events' : ''} ${isToday ? 'today' : ''}">
                <div class="week-day-header" onclick="selectDate(${dayTimestamp})" style="cursor: pointer">
                    <span class="week-day-name">${dayName}</span>
                    <span class="week-day-date">${dayDate}</span>
                    ${isToday ? '<span class="week-day-today-badge">Ma</span>' : ''}
                </div>
                <div class="week-day-events">
                    ${dayEvents.length === 0 ? '<p class="week-no-events">Nincs óra</p>' : ''}
                    ${dayEvents.map(event => `
                        <div class="week-event-card" style="border-left-color: ${getCalendarColor(event.calendarId)}"
                             onclick="event.stopPropagation(); selectDate(${dayTimestamp})">
                            <div class="week-event-time">
                                <span class="week-event-start">${window.formatTime(event.start)}</span>
                                <span class="week-event-end">${window.formatTime(event.end)}</span>
                            </div>
                            <div class="week-event-details">
                                <h4 class="week-event-name">${escapeHtml(event.summary)}</h4>
                                <p class="week-event-location">${escapeHtml(event.location || '')}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render month view - Shows event indicators as color-matched dots
 */
function renderMonthView() {
    const year = AppState.currentDate.getFullYear();
    const month = AppState.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDay = firstDay.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const totalDays = Math.ceil((lastDay.getDate() + startDay) / 7) * 7;
    const days = [];
    const today = new Date();

    for (let i = 0; i < totalDays; i++) {
        const dayOffset = i - startDay;
        const day = new Date(year, month, dayOffset);
        const isCurrentMonth = day.getMonth() === month;
        const isToday = isSameDay(day, today);
        const dayEvents = getEventsForDate(day, AppState.events);

        days.push({
            date: day,
            day: day.getDate(),
            isCurrentMonth,
            isToday,
            events: dayEvents
        });
    }

    DOM.monthContent.innerHTML = days.map(day => {
        // Show dots for events (max 6 dots, then "+N" indicator)
        const maxDots = 6;
        const dotsToShow = Math.min(day.events.length, maxDots);
        const eventDots = day.events.length > 0
            ? Array.from({ length: dotsToShow }, (_, i) => {
                const event = day.events[i];
                const color = getCalendarColor(event.calendarId);
                return `<div class="month-event-dot" 
                             style="background: ${color}" 
                             title="${escapeHtml(event.summary)}"
                             onclick="event.stopPropagation(); selectDate(${day.date.getTime()})"></div>`;
              }).join('') + (day.events.length > maxDots ? `<div class="month-event-more">+${day.events.length - maxDots}</div>` : '')
            : '';

        return `
            <div class="month-day ${!day.isCurrentMonth ? 'month-day-other' : ''} ${day.isToday ? 'today' : ''}"
                 onclick="selectDate(${day.date.getTime()})">
                <span class="month-day-number">${day.day}</span>
                <div class="month-day-events">${eventDots}</div>
            </div>
        `;
    }).join('');
}

/**
 * Load calendars from IndexedDB
 */
async function loadCalendars() {
    try {
        AppState.calendars = await window.NeptunDB.getAllCalendars();
        console.log('[App] Loaded', AppState.calendars.length, 'calendars');
    } catch (error) {
        console.error('[App] Error loading calendars:', error);
        AppState.calendars = [];
    }
}

/**
 * Load all events from enabled calendars
 */
async function loadAllEvents() {
    const enabledCalendars = AppState.calendars.filter(cal => cal.enabled);
    const allEvents = [];

    setState(STATE_LOADING);
    showLoadingOverlay('Naptár betöltése...');

    try {
        for (const calendar of enabledCalendars) {
            try {
                const events = await window.fetchCalendar(calendar.url);

                events.forEach((event, index) => {
                    event.calendarId = calendar.id;
                    event.calendarColor = calendar.color;
                    event.calendarName = calendar.name;
                    event._id = `${calendar.id}-${index}-${event.start.getTime()}`;
                });

                allEvents.push(...events);
                await window.NeptunDB.updateLastFetched(calendar.id);
            } catch (error) {
                console.error('[App] Error loading calendar:', calendar.name, error);
            }
        }

        allEvents.sort((a, b) => a.start - b.start);
        AppState.events = allEvents;

        console.log('[App] Loaded', allEvents.length, 'total events');

        setState(STATE_CALENDAR);
        renderCurrentView();
    } finally {
        setTimeout(() => {
            hideLoadingOverlay();
        }, 500);
    }
}

/**
 * Handle add calendar form
 */
async function handleAddCalendar(e) {
    e.preventDefault();
    hideError();

    const nameInput = document.getElementById('calendar-name');
    const urlInput = document.getElementById('calendar-url');

    const calendarData = {
        name: nameInput.value.trim() || null,
        url: urlInput.value.trim(),
        color: AppState.selectedColor
    };

    if (!calendarData.url) {
        showError('A naptár URL megadása kötelező!');
        return;
    }

    // Validate URL format
    try {
        new URL(calendarData.url);
    } catch (e) {
        showError('Érvénytelen URL formátum. Másolja be a Neptunból az ICS linket.');
        return;
    }

    // Check if URL is a Neptun URL
    if (!calendarData.url.includes('neptun')) {
        showError('A URL nem tartalmazza a "neptun" kifejezést. Biztosan jól másolta be?');
    }

    try {
        const testEvents = await window.fetchCalendar(calendarData.url);

        if (testEvents.length === 0) {
            showError('Figyelem: A naptár üres, de hozzáadható.');
        }

        await window.NeptunDB.addCalendar(calendarData);

        // Reload calendars and events
        await loadCalendars();
        await loadAllEvents();

        // Reset form and close modal
        DOM.addCalendarForm.reset();
        const modal = document.getElementById('add-calendar-modal');
        delete modal.dataset.mandatory;
        hideModal(MODAL_ADD_ICS);

        // Show success message
        showSuccess('Naptár sikeresen hozzáadva!');
    } catch (error) {
        let errorMessage = 'Hiba a naptár betöltésekor: ';
        
        if (error.message.includes('HTTP 404')) {
            errorMessage += 'A megadott URL nem található (404). Ellenőrizze, hogy jól másolta-e be.';
        } else if (error.message.includes('HTTP 403')) {
            errorMessage += 'Hozzáférés megtagadva (403). Lehet, hogy lejárt a link érvényessége.';
        } else if (error.message.includes('HTTP 500') || error.message.includes('HTTP 502') || error.message.includes('HTTP 503')) {
            errorMessage += 'Szerver hiba. Próbálja újra később.';
        } else if (error.message.includes('Invalid ICS')) {
            errorMessage += 'Érvénytelen ICS fájl. A link nem vezet naptárfájlra.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMessage += 'Hálózati hiba. Ellenőrizze az internetkapcsolatot.';
        } else {
            errorMessage += error.message;
        }
        
        showError(errorMessage);
        console.error('[App] Error adding calendar:', error);
    }
}

/**
 * Open manage calendars modal
 */
async function openManageCalendarsModal() {
    await loadCalendars();

    if (AppState.calendars.length === 0) {
        DOM.calendarsList.innerHTML = `
            <p style="text-align:center;color:var(--text-secondary);padding:2rem;">
                Nincsenek naptárak hozzáadva
            </p>
        `;
    } else {
        DOM.calendarsList.innerHTML = AppState.calendars.map(cal => `
            <div class="calendar-item" style="border-left-color: ${cal.color}">
                <div class="calendar-color" style="background: ${cal.color}"></div>
                <div class="calendar-info">
                    <div class="calendar-name">${escapeHtml(cal.name)}</div>
                    <div class="calendar-url">${escapeHtml(cal.url.substring(0, 50))}...</div>
                </div>
                <div class="calendar-actions">
                    <button class="calendar-action-btn" onclick="toggleCalendar(${cal.id})" title="${cal.enabled ? 'Letiltás' : 'Engedélyezés'}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${cal.enabled
                                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M1 1l22 22"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>'
                            }
                        </svg>
                    </button>
                    <button class="calendar-action-btn edit" onclick="openEditCalendar(${cal.id})" title="Szerkesztés">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="calendar-action-btn delete" onclick="deleteCalendar(${cal.id})" title="Törlés">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Show install prompt in modal if PWA is not installed and we have deferred prompt
    const installPrompt = document.getElementById('manage-modal-install-prompt');
    const hasInstalled = localStorage.getItem('neptun_hasInstalled');
    if (installPrompt) {
        if (!hasInstalled && AppState.deferredPrompt) {
            installPrompt.hidden = false;
        } else {
            installPrompt.hidden = true;
        }
    }

    // Update notifications toggle state and check system support
    const notificationsToggle = document.getElementById('notifications-toggle');
    const notificationWarning = document.getElementById('notification-warning');
    if (notificationsToggle) {
        const hasSystemSupport = 'Notification' in window;
        const hasPermission = hasSystemSupport && Notification.permission === 'granted';
        const savedSetting = localStorage.getItem('neptun_notificationsEnabled');
        const isEnabled = savedSetting === 'true' && hasPermission;
        
        notificationsToggle.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
        notificationsToggle.disabled = !hasSystemSupport;
        AppState.notificationsEnabled = isEnabled;
        
        // Show warning if notifications are not supported or denied
        if (notificationWarning) {
            if (!hasSystemSupport) {
                notificationWarning.hidden = false;
                notificationWarning.querySelector('.warning-text').textContent = 
                    'Az értesítések nem támogatottak ezen az eszközön.';
            } else if (Notification.permission === 'denied') {
                notificationWarning.hidden = false;
                notificationWarning.querySelector('.warning-text').textContent = 
                    'Az értesítések le vannak tiltva. Engedélyezd a böngésző beállításaiban.';
            } else {
                notificationWarning.hidden = true;
            }
        }
    }

    showModal(MODAL_MANAGE);
}

/**
 * Setup pull-to-refresh
 */
function setupPullToRefresh() {
    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    const threshold = 100;
    let lastRefreshTime = 0;
    const REFRESH_COOLDOWN = 5000; // 5 seconds cooldown between refreshes

    DOM.mainContent.addEventListener('touchstart', (e) => {
        if (DOM.mainContent.scrollTop === 0 && !AppState.isLoading) {
            startY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: true });

    DOM.mainContent.addEventListener('touchmove', (e) => {
        if (!isPulling || AppState.isLoading) return;

        currentY = e.touches[0].clientY;
        const pullDistance = currentY - startY;

        if (pullDistance > 0 && pullDistance < threshold) {
            e.preventDefault();
            
            // Show indicator while pulling
            DOM.ptrIndicator.style.opacity = (pullDistance / threshold).toString();
            DOM.ptrIndicator.style.transform = `translateY(${pullDistance}px)`;
        }
    }, { passive: false });

    DOM.mainContent.addEventListener('touchend', async () => {
        if (!isPulling || AppState.isLoading) return;

        const pullDistance = currentY - startY;
        isPulling = false;

        // Check cooldown
        const now = Date.now();
        if (now - lastRefreshTime < REFRESH_COOLDOWN) {
            DOM.ptrIndicator.style.transform = '';
            DOM.ptrIndicator.style.opacity = '';
            return;
        }

        if (pullDistance > threshold) {
            // Trigger refresh
            lastRefreshTime = now;
            DOM.ptrIndicator.classList.add('visible', 'refreshing');
            DOM.ptrIndicator.style.transform = 'translateY(0)';
            DOM.ptrIndicator.style.opacity = '1';
            
            showLoadingOverlay('Frissítés...');

            try {
                await loadAllEvents();
                showSuccess('Naptár frissítve');
            } catch (error) {
                showError('Frissítés sikertelen: ' + error.message);
            } finally {
                setTimeout(() => {
                    DOM.ptrIndicator.classList.remove('visible', 'refreshing');
                    DOM.ptrIndicator.style.transform = '';
                    DOM.ptrIndicator.style.opacity = '';
                }, 500);
            }
        } else {
            // Reset indicator
            DOM.ptrIndicator.style.transform = '';
            DOM.ptrIndicator.style.opacity = '';
        }
    });
}

/**
 * Setup PWA install prompt
 */
function setupPWAInstallPrompt() {
    const installBtnHeader = document.getElementById('install-pwa-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        AppState.deferredPrompt = e;
        console.log('[PWA] Install prompt ready');

        // Show install button in header
        if (installBtnHeader) {
            installBtnHeader.hidden = false;
        }

        // Check if we should show install modal
        const hasInstalled = localStorage.getItem('neptun_hasInstalled');
        const hasDismissed = localStorage.getItem('neptun_installDismissed');

        // Show install modal if not installed and not dismissed this session
        if (!hasInstalled && !hasDismissed && AppState.deferredPrompt) {
            showPWAInstallModal();
        }
    });

    // Header install button click (debounced)
    if (installBtnHeader) {
        installBtnHeader.addEventListener('click', () => {
            debounce('install-header', async () => {
                if (AppState.deferredPrompt) {
                    AppState.deferredPrompt.prompt();
                    const { outcome } = await AppState.deferredPrompt.userChoice;
                    console.log('[PWA] Install', outcome);
                    if (outcome === 'accepted') {
                        localStorage.setItem('neptun_hasInstalled', 'true');
                        installBtnHeader.hidden = true;
                    }
                    AppState.deferredPrompt = null;
                }
            }, 1000);
        });
    }

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed');
        localStorage.setItem('neptun_hasInstalled', 'true');
        AppState.deferredPrompt = null;
        if (installBtnHeader) {
            installBtnHeader.hidden = true;
        }
        hideModal(MODAL_PWA_INSTALL);
    });

    // Setup PWA install modal buttons (debounced)
    const installBtn = document.getElementById('pwa-install-button');
    const laterBtn = document.getElementById('pwa-install-later');

    if (installBtn) {
        installBtn.addEventListener('click', () => {
            debounce('pwa-install', async () => {
                if (AppState.deferredPrompt) {
                    AppState.deferredPrompt.prompt();
                    const { outcome } = await AppState.deferredPrompt.userChoice;
                    console.log('[PWA] Install', outcome);
                    if (outcome === 'accepted') {
                        localStorage.setItem('neptun_hasInstalled', 'true');
                        if (installBtnHeader) {
                            installBtnHeader.hidden = true;
                        }
                    }
                    AppState.deferredPrompt = null;
                    hideModal(MODAL_PWA_INSTALL);
                }
            }, 1000);
        });
    }

    if (laterBtn) {
        laterBtn.addEventListener('click', () => {
            debounce('pwa-later', () => {
                localStorage.setItem('neptun_installDismissed', 'true');
                hideModal(MODAL_PWA_INSTALL);
            }, 500);
        });
    }

    // Setup manage modal install button (debounced)
    const manageModalInstallBtn = document.getElementById('manage-modal-install-btn');
    if (manageModalInstallBtn) {
        manageModalInstallBtn.addEventListener('click', () => {
            debounce('manage-install', async () => {
                if (AppState.deferredPrompt) {
                    AppState.deferredPrompt.prompt();
                    const { outcome } = await AppState.deferredPrompt.userChoice;
                    console.log('[PWA] Install', outcome);
                    if (outcome === 'accepted') {
                        localStorage.setItem('neptun_hasInstalled', 'true');
                        if (installBtnHeader) {
                            installBtnHeader.hidden = true;
                        }
                        const installPrompt = document.getElementById('manage-modal-install-prompt');
                        if (installPrompt) {
                            installPrompt.hidden = true;
                        }
                    }
                    AppState.deferredPrompt = null;
                }
            }, 1000);
        });
    }
}

/**
 * Show PWA install modal
 */
function showPWAInstallModal() {
    showModal(MODAL_PWA_INSTALL);
}

/**
 * Setup first-time setup modal
 */
function setupFirstTimeModal() {
    const submitBtn = document.getElementById('firsttime-submit');
    const urlInput = document.getElementById('firsttime-calendar-url');
    const nameInput = document.getElementById('firsttime-calendar-name');

    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const url = urlInput.value.trim();
            const name = nameInput.value.trim() || null;

            if (!url) {
                showError('A naptár URL megadása kötelező!');
                return;
            }

            // Validate URL format
            try {
                new URL(url);
            } catch (e) {
                showError('Érvénytelen URL formátum. Másolja be a Neptunból az ICS linket.');
                return;
            }

            // Use withLoading for automatic loading state
            await withLoading('firsttime-submit', async () => {
                // Test fetch the URL first
                const testEvents = await window.fetchCalendar(url);

                if (testEvents.length === 0) {
                    showError('Figyelem: A naptár üres, de hozzáadható.');
                }

                // Add to database
                await window.NeptunDB.addCalendar({
                    url: url,
                    name: name,
                    color: AppState.selectedColor
                });

                // Reload calendars and events
                await loadCalendars();
                await loadAllEvents();

                // Hide modal
                hideModal(MODAL_FIRSTTIME);

                // Show success message
                showSuccess('Naptár sikeresen hozzáadva!');
            }, 'Naptár betöltése...');
        });
    }
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboard(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    // Don't handle keyboard when modal is open
    if (AppState.currentModal !== MODAL_NONE) {
        if (e.key === 'Escape') {
            hideModal(AppState.currentModal);
        }
        return;
    }
    
    switch (e.key.toLowerCase()) {
        case '1':
            switchView('day');
            break;
        case '2':
            switchView('week');
            break;
        case '3':
            switchView('month');
            break;
        case 'arrowleft':
            navigatePeriod(-1);
            break;
        case 'arrowright':
            navigatePeriod(1);
            break;
        case 't':
            goToToday();
            break;
        case 'n':
            showModal(MODAL_ADD_ICS);
            break;
        case 'm':
            openManageCalendarsModal();
            break;
    }
}

/* ==================== HELPER FUNCTIONS ==================== */

function getEventsForDate(date, events) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    return events.filter(event => {
        if (!event.start) return false;
        return (
            event.start.getFullYear() === year &&
            event.start.getMonth() === month &&
            event.start.getDate() === day
        );
    });
}

function createEventCard(event, clickable = false) {
    const startTime = window.formatTime(event.start);
    const endTime = window.formatTime(event.end);
    
    // Check if event is currently active
    const now = new Date();
    const isActive = now >= event.start && now <= event.end;
    
    let timeDisplay = '';
    if (isActive) {
        // Show time remaining for active events
        const timeRemaining = event.end - now;
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
        timeDisplay = `
            <span class="event-time-remaining" data-event-id="${event._id}" data-end="${event.end.getTime()}">
                <span class="time-label">Hátralévő:</span>
                <span class="time-countdown">${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}</span>
            </span>`;
    } else {
        timeDisplay = `
            <span class="event-time-start">${startTime}</span>
            <span class="event-time-end">${endTime}</span>`;
    }

    const clickClass = clickable ? 'event-card-clickable' : '';

    return `
        <article class="event-card ${isActive ? 'event-card-active' : ''} ${clickClass}" style="border-left-color: ${event.calendarColor || 'var(--primary)'}" data-event-id="${event._id}">
            <div class="event-time">
                ${timeDisplay}
            </div>
            <div class="event-details">
                <h3 class="event-name">${escapeHtml(event.summary)}</h3>
                <p class="event-location">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                    ${escapeHtml(event.location || 'Nincs helyszín')}
                </p>
                ${event.teacher ? `<p class="event-teacher">${event.teacher}</p>` : ''}
            </div>
        </article>
    `;
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function getCalendarColor(id) {
    const calendar = AppState.calendars.find(cal => cal.id === id);
    return calendar ? calendar.color : 'var(--primary)';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ==================== GLOBAL FUNCTIONS ==================== */

window.toggleCalendar = async function(id) {
    const calendar = await window.NeptunDB.getCalendar(id);
    if (calendar) {
        await window.NeptunDB.toggleCalendarEnabled(id, !calendar.enabled);
        await openManageCalendarsModal();
        await loadAllEvents();
    }
};

window.deleteCalendar = async function(id) {
    // Show confirmation in UI instead of confirm dialog
    const modal = document.getElementById('manage-calendars-modal');
    const confirmDiv = document.createElement('div');
    confirmDiv.id = 'delete-confirm';
    confirmDiv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    confirmDiv.innerHTML = `
        <div style="background:var(--surface);padding:2rem;border-radius:1rem;max-width:400px;text-align:center;">
            <p style="margin-bottom:1.5rem;font-size:1rem;">Biztosan törölni szeretné ezt a naptárat?</p>
            <div style="display:flex;gap:1rem;justify-content:center;">
                <button id="delete-cancel" class="btn-secondary" style="padding:0.5rem 1.5rem;">Mégse</button>
                <button id="delete-confirm-btn" class="btn-primary" style="padding:0.5rem 1.5rem;background:#ef4444;">Törlés</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmDiv);
    
    return new Promise((resolve) => {
        document.getElementById('delete-cancel').onclick = () => {
            document.body.removeChild(confirmDiv);
            resolve();
        };
        
        document.getElementById('delete-confirm-btn').onclick = async () => {
            document.body.removeChild(confirmDiv);
            try {
                await window.NeptunDB.deleteCalendar(id);
                await loadCalendars();
                await openManageCalendarsModal();
                await loadAllEvents();
                showSuccess('Naptár törölve');
                resolve();
            } catch (error) {
                console.error('[App] Error deleting calendar:', error);
                showError('Hiba a naptár törlésekor: ' + error.message);
                resolve();
            }
        };
    });
};

window.openEditCalendar = async function(id) {
    const calendar = await window.NeptunDB.getCalendar(id);
    if (!calendar) return;

    // Fill in the edit form
    document.getElementById('edit-calendar-id').value = calendar.id;
    document.getElementById('edit-calendar-name').value = calendar.name || '';
    document.getElementById('edit-calendar-url').value = calendar.url;

    // Set color picker
    document.querySelectorAll('#edit-color-picker .color-option').forEach(option => {
        option.classList.remove('active');
        if (option.dataset.color === calendar.color) {
            option.classList.add('active');
        }
    });

    // Show edit modal
    const editModal = document.getElementById('edit-calendar-modal');
    editModal.hidden = false;
    editModal.setAttribute('open', '');
};

// Edit calendar form handler
const editCalendarForm = document.getElementById('edit-calendar-form');
if (editCalendarForm) {
    editCalendarForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const id = parseInt(document.getElementById('edit-calendar-id').value, 10);
        const name = document.getElementById('edit-calendar-name').value.trim();
        const url = document.getElementById('edit-calendar-url').value.trim();
        const colorOption = document.querySelector('#edit-color-picker .color-option.active');
        const color = colorOption ? colorOption.dataset.color : '#6366f1';

        if (!url) {
            showError('Az URL megadása kötelező!');
            return;
        }

        try {
            // Update calendar in database
            const calendar = await window.NeptunDB.getCalendar(id);
            if (calendar) {
                calendar.name = name || `Naptár ${new Date().toLocaleDateString('hu-HU')}`;
                calendar.url = url;
                calendar.color = color;
                await window.NeptunDB.updateCalendar(calendar);

                // Reload calendars and events
                await loadCalendars();
                await openManageCalendarsModal();
                await loadAllEvents();

                showSuccess('Naptár frissítve');
            }
        } catch (error) {
            showError('Hiba a naptár frissítésekor: ' + error.message);
            console.error('[App] Error updating calendar:', error);
        }
    });
}

// Edit color picker
document.querySelectorAll('#edit-color-picker .color-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('#edit-color-picker .color-option').forEach(o => o.classList.remove('active'));
        option.classList.add('active');
    });
});

window.showEventDetails = function(eventId) {
    const event = AppState.events.find(e => e._id === eventId);
    if (!event) return;
    
    const content = document.getElementById('event-details-content');
    const startDate = event.start.toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
    
    content.innerHTML = `
        <div class="event-detail-row">
            <span class="event-detail-label">Esemény</span>
            <span class="event-detail-value"><strong>${escapeHtml(event.summary)}</strong></span>
        </div>
        <div class="event-detail-row">
            <span class="event-detail-label">Dátum</span>
            <span class="event-detail-value">${startDate}</span>
        </div>
        <div class="event-detail-row">
            <span class="event-detail-label">Idő</span>
            <span class="event-detail-value">${window.formatTime(event.start)} - ${window.formatTime(event.end)} (${event.durationMinutes} perc)</span>
        </div>
        <div class="event-detail-row">
            <span class="event-detail-label">Helyszín</span>
            <span class="event-detail-value">${escapeHtml(event.location || 'Nincs megadva')}</span>
        </div>
        ${event.teacher ? `
        <div class="event-detail-row">
            <span class="event-detail-label">Oktató</span>
            <span class="event-detail-value">${escapeHtml(event.teacher)}</span>
        </div>
        ` : ''}
        ${event.courseCode ? `
        <div class="event-detail-row">
            <span class="event-detail-label">Tárgykód</span>
            <span class="event-detail-value">${escapeHtml(event.courseCode)}</span>
        </div>
        ` : ''}
        <div class="event-detail-row">
            <span class="event-detail-label">Naptár</span>
            <span class="event-detail-value" style="display:flex;align-items:center;gap:8px;">
                <span style="width:12px;height:12px;border-radius:50%;background:${event.calendarColor}"></span>
                ${escapeHtml(event.calendarName || 'Ismeretlen')}
            </span>
        </div>
    `;
    
    showModal(MODAL_EVENT);
};

window.selectDate = function(timestamp) {
    AppState.currentDate = new Date(timestamp);
    switchView('day');
};

// Debug helper
function updateDebug() {
    console.log('[Debug] State:', AppState.currentState, 'Modal:', AppState.currentModal);
}

/**
 * Start event timer for active event countdown
 */
function startEventTimer() {
    if (AppState.eventTimer) {
        clearInterval(AppState.eventTimer);
    }
    
    updateEventTimer();
    AppState.eventTimer = setInterval(updateEventTimer, 1000);
}

/**
 * Update event timer display
 */
function updateEventTimer() {
    const now = new Date();
    const timerBar = document.getElementById('event-timer-bar');
    const timerName = document.getElementById('event-timer-name');
    const timerCountdown = document.getElementById('event-timer-countdown');
    const timerProgress = document.getElementById('event-timer-progress');

    // Update all event card countdowns
    const countdownElements = document.querySelectorAll('.event-time-remaining');
    countdownElements.forEach(element => {
        const eventId = element.dataset.eventId;
        const eventEnd = parseInt(element.dataset.end, 10);
        const event = AppState.events.find(e => e._id === eventId);
        
        if (event && eventEnd) {
            const timeRemaining = eventEnd - now.getTime();
            
            if (timeRemaining <= 0) {
                // Event ended - refresh the view
                if (AppState.currentView === 'day') {
                    renderDayView();
                }
                return;
            }
            
            const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
            
            const countdownSpan = element.querySelector('.time-countdown');
            if (countdownSpan) {
                countdownSpan.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }
    });

    if (!timerBar || !timerName || !timerCountdown || !timerProgress) return;

    // Find currently active event
    const activeEvent = AppState.events.find(event => {
        if (!event.start || !event.end) return false;
        return now >= event.start && now <= event.end;
    });

    if (activeEvent) {
        const timeRemaining = activeEvent.end - now;
        const totalDuration = activeEvent.end - activeEvent.start;
        const elapsed = now - activeEvent.start;
        const progressPercent = (elapsed / totalDuration) * 100;

        // Format countdown
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

        timerName.textContent = activeEvent.summary;
        timerCountdown.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        timerProgress.style.width = `${Math.min(progressPercent, 100)}%`;
        timerBar.classList.add('visible');
    } else {
        timerBar.classList.remove('visible');
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

/**
 * Request notification permission
 */
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('[Notifications] Not supported');
        return false;
    }

    if (Notification.permission === 'granted') {
        AppState.notificationsEnabled = true;
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            AppState.notificationsEnabled = true;
            return true;
        }
    }

    return false;
}

/**
 * Send notification for upcoming event using Service Worker
 * Chrome Android requires using serviceWorkerRegistration.showNotification()
 */
async function sendEventNotification(event) {
    if (!AppState.notificationsEnabled) return;

    const now = new Date();
    const timeUntilStart = event.start - now;

    // Notify 15 minutes before event
    const NOTIFY_BEFORE_MS = 15 * 60 * 1000;

    if (timeUntilStart > 0 && timeUntilStart <= NOTIFY_BEFORE_MS) {
        const eventKey = `${event._id}-${event.start.getTime()}`;

        // Don't notify twice for same event
        if (AppState.notifiedEvents.has(eventKey)) return;

        const minutesUntilStart = Math.floor(timeUntilStart / 60000);

        // Try to use Service Worker notification API (required for Chrome Android)
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification('Neptun-Lite - Közelgő óra', {
                    body: `${minutesUntilStart} perc múlva kezdődik: ${event.summary}`,
                    icon: '/icons/icon-512.webp',
                    badge: '/icons/icon-192.webp',
                    tag: eventKey,
                    requireInteraction: false,
                    silent: false,
                    data: {
                        eventId: event._id,
                        url: window.location.href
                    }
                });
                AppState.notifiedEvents.add(eventKey);
                console.log('[Notifications] Sent via SW for:', event.summary);
                return;
            } catch (error) {
                console.error('[Notifications] SW notification failed:', error);
                // Fallback to standard Notification API
            }
        }

        // Fallback for desktop browsers
        new Notification('Neptun-Lite - Közelgő óra', {
            body: `${minutesUntilStart} perc múlva kezdődik: ${event.summary}`,
            icon: '/icons/icon-512.webp',
            badge: '/icons/icon-192.webp',
            tag: eventKey,
            requireInteraction: false,
            silent: false
        });

        AppState.notifiedEvents.add(eventKey);
        console.log('[Notifications] Sent fallback for:', event.summary);
    }
}

/**
 * Start notification checker for upcoming events
 * Runs every 15 minutes to balance battery life and timely notifications
 */
function startNotificationChecker() {
    if (!('Notification' in window)) return;
    if (!AppState.notificationsEnabled) return;

    // Check immediately on start
    checkUpcomingEvents();
    
    // Then check every 15 minutes (balance between battery and accuracy)
    AppState.notificationTimer = setInterval(checkUpcomingEvents, 15 * 60 * 1000);

    console.log('[Notifications] Checker started (15 min interval)');
}

/**
 * Check for upcoming events and send notifications
 */
function checkUpcomingEvents() {
    const now = new Date();
    const NOTIFY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

    AppState.events.forEach(event => {
        if (!event.start) return;

        const timeUntilStart = event.start - now;

        // Only notify for events starting in the next 15 minutes
        if (timeUntilStart > 0 && timeUntilStart <= NOTIFY_WINDOW_MS) {
            sendEventNotification(event);
        }
    });
}

/**
 * Stop notification checker
 */
function stopNotificationChecker() {
    if (AppState.notificationTimer) {
        clearInterval(AppState.notificationTimer);
        AppState.notificationTimer = null;
    }
}
