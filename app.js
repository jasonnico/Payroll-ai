/* =====================================================
   MHR PayrollAI — app.js
   Chat logic, mock AI responses, sidebar, theme
===================================================== */

// -- Payroll data --
// This will be populated from the secure backend API upon login.
let PAYROLL_DATA = null;

let activeChatId = null;

// -- DOM refs --
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginEmployeeId = document.getElementById('login-employee-id');
const loginBtn = document.getElementById('login-btn');
const app = document.getElementById('app');
const messagesArea = document.getElementById('messages-area');
const welcomeBanner = document.getElementById('welcome-banner');
const messageInput = document.getElementById('message-input');                  // Variables that holds reference to the elements seen/existing on the login page
const sendBtn = document.getElementById('send-btn');
const hamburgerBtn = document.getElementById('hamburger-btn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const newChatBtn = document.getElementById('new-chat-btn');
const clearBtn = document.getElementById('clear-btn');
const logoutBtn = document.getElementById('logout-btn');
const displayName = document.getElementById('display-name');
const welcomeNameEl = document.getElementById('welcome-name');
const chatList = document.getElementById('chat-list');

let currentUser = null;
let isBotTyping = false;

// ==============================================
//  THEME TOGGLE
// ==============================================
const root = document.documentElement;

// Load saved preference
const savedTheme = localStorage.getItem('mhr-theme') || 'dark';
root.setAttribute('data-theme', savedTheme);
updateThemeUI(savedTheme);

function toggleTheme() {
  const current = root.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';            // toggleTheme() allows switching between dark and light modes for user preference
  root.setAttribute('data-theme', next);
  localStorage.setItem('mhr-theme', next);
  updateThemeUI(next);
}

function updateThemeUI(theme) {
  const isLight = theme === 'light';
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  if (sunIcon) sunIcon.style.display = isLight ? 'block' : 'none';
  if (moonIcon) moonIcon.style.display = isLight ? 'none' : 'block';             // Updates the theme 

  const loginLabel = document.getElementById('login-toggle-label');
  const sidebarLabel = document.getElementById('sidebar-toggle-label');
  const label = isLight ? 'Dark' : 'Light';
  if (loginLabel) loginLabel.textContent = label;
  if (sidebarLabel) sidebarLabel.textContent = label;
}

// Bind all toggle buttons
['login-theme-toggle', 'sidebar-theme-toggle', 'header-theme-toggle'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', toggleTheme);
});

// ==============================================
//  LOGIN (Employee ID)
// ==============================================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputId = loginEmployeeId.value.trim().toUpperCase();

  try {
    const response = await fetch('http://localhost:5000/api/login/' + inputId);

    if (!response.ok) {
      throw new Error('Employee not found');
    }

    const data = await response.json();

    // Set current user and payroll data based on database response
    currentUser = data.user;
    PAYROLL_DATA = data.payroll;

    displayName.textContent = currentUser.name;
    document.getElementById('user-avatar-initials').textContent = currentUser.initials;
    welcomeNameEl.textContent = currentUser.name.split(' ')[0];

    loginBtn.textContent = 'Welcome! Loading…';
    loginScreen.classList.add('hidden');
    setTimeout(() => {
      loginScreen.style.display = 'none';
      app.classList.add('visible');
      messageInput.focus();
      loadChatHistory();
    }, 400);

  } catch (err) {
    loginEmployeeId.style.borderColor = '#DC2626';
    loginBtn.textContent = 'Invalid Employee ID — try again';
    loginBtn.style.background = 'linear-gradient(135deg,#DC2626,#B91C1C)';
    setTimeout(() => {
      loginEmployeeId.style.borderColor = '';
      loginBtn.textContent = 'Sign In to PayrollAI';
      loginBtn.style.background = '';
    }, 2200);
  }
});

// ==============================================
//  SIDEBAR (mobile)
// ==============================================
function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
}
hamburgerBtn.addEventListener('click', () =>
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar()
);
sidebarOverlay.addEventListener('click', closeSidebar);

chatList.addEventListener('click', (e) => {
  // Sidebar chat list removed
});

// ==============================================
//  INFO POPUP
// ==============================================
const infoBtn = document.getElementById('info-btn');
const infoPopup = document.getElementById('info-popup');

if (infoBtn && infoPopup) {
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    infoPopup.classList.toggle('show');
  });

  // Close popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!infoPopup.contains(e.target) && !infoBtn.contains(e.target)) {
      infoPopup.classList.remove('show');
    }
  });
}

// ==============================================
//  INPUT
// ==============================================
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  sendBtn.disabled = messageInput.value.trim().length === 0 || isBotTyping;
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) sendMessage(); }
});

sendBtn.addEventListener('click', sendMessage);

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
   const query = btn.getAttribute('data-query');
    const action = btn.getAttribute('action');
     
    if (action) {
      welcomeBanner.style.display = 'none';
      appendMessage('user', 'Can I update my bank details?');
      appendBotMessage({ text: `For security reasons, bank detail changes can only be made from the secure self-service portal. [Open Secure Portal](https://peoplefirst.mhr.co.uk/)` });
      return;
    }

    messageInput.value = btn.getAttribute('data-query');;
    sendMessage();

  });
});

// ==============================================
//  NEW CHAT / CLEAR / LOGOUT
// ==============================================
newChatBtn.addEventListener('click', clearChat);

function clearChat() {
  document.querySelectorAll('.message-group, .typing-indicator').forEach(el => el.remove());
  welcomeBanner.style.display = 'block';
  closeSidebar();
  // Reset the active chat so the next message creates a brand new session
  activeChatId = null;
  renderSidebarChats();
}

logoutBtn.addEventListener('click', () => {
  app.classList.remove('visible');
  loginScreen.style.display = '';
  setTimeout(() => loginScreen.classList.remove('hidden'), 10);
  loginEmployeeId.value = '';
  clearChat();
  currentUser = null;
});

// ==============================================
//  SEND MESSAGE
// ==============================================
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isBotTyping) return;

  welcomeBanner.style.display = 'none';
  appendMessage('user', text);

  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  showTypingIndicator();
  isBotTyping = true;

  const delay = 900 + Math.random() * 700;
  setTimeout(async () => {
    removeTypingIndicator();
    isBotTyping = false;

    const userName = currentUser?.name || 'there';

    // -- Call the true AI Generative Endpoint directly --
    try {
      const aiResponse = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          employeeNumber: PAYROLL_DATA?.employeeNumber || "UNKNOWN"
        })
      });

      if (!aiResponse.ok) throw new Error('AI API Error');

      const data = await aiResponse.json();

      // Check if the AI flagged this response for HR escalation
      let responseText = data.response;
      let shouldEscalate = false;

      if (responseText.includes('[ESCALATE_TICKET]')) {
        shouldEscalate = true;
        // Strip the tag so the user never sees it
        responseText = responseText.replace(/\[ESCALATE_TICKET\]/g, '').trim();
      }

      // Render the AI's markdown text and attach escalation card if triggered
      appendBotMessage({ text: responseText, escalate: shouldEscalate });
      
    } catch (error) {
      console.error('Failed to contact AI:', error);
      appendBotMessage({ text: "Sorry, my AI brain seems to be disconnected right now." });
    }

    sendBtn.disabled = messageInput.value.trim().length === 0;
    messageInput.focus();
  }, delay);
}

// -- UI UI parsing functions (REMOVED: Now handled dynamically by Gemini in app.py) --

// ==============================================
//  RENDER HELPERS
// ==============================================
function now() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(text) {
  // Use marked.js library if available to handle complex markdown like tables
  // Without this the chatbot might give markdown formatting and it will look like raw dashes, eg: "2000 ---"
  if (typeof marked !== 'undefined') {
    return marked.parse(text);
  }
  // Fallback for basic text if marked fails to load
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--pink);text-decoration:underline">$1</a>')
    .replace(/\n/g, '<br>');
}

function appendMessage(role, text, isHistoryLoad = false, timeStr = now()) {
  const group = document.createElement('div');
  group.className = `message-group ${role}`;
  const initials = currentUser?.initials || 'U';

  group.innerHTML = `
    <div class="msg-bubble">
      <div class="msg-content">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div class="msg-time">${timeStr}</div>
    </div>
    <div class="msg-avatar" aria-hidden="true">${initials}</div>
  `;
  messagesArea.appendChild(group);
  scrollToBottom();

  if (!isHistoryLoad) {
    saveToHistory({ type: 'user', role, text, time: timeStr });
  }
}

function appendBotMessage(resp, isHistoryLoad = false, timeStr = now()) {
  const group = document.createElement('div');
  group.className = 'message-group bot';

  let cardHTML = '';
  if (resp.card) {
    const rows = resp.card.rows.map(r =>
      `<div class="payroll-row">
        <span class="label">${r.label}</span>
        <span class="value ${r.cls || ''}">${r.value}</span>
      </div>`
    ).join('');
    cardHTML = `<div class="payroll-card"><div class="card-title">${resp.card.title}</div>${rows}</div>`;
  }

  let escalateHTML = '';
  if (resp.escalate) {
    escalateHTML = `
      <div class="escalate-card">
        <span class="esc-icon" aria-hidden="true">\uD83D\uDC64</span>
        <div class="esc-text">
          <strong>Connect with HR</strong>
          <p>An advisor can help with complex queries.</p>
        </div>
        <button class="esc-btn" onclick="handleEscalateTicket(this)">Request Agent</button>
      </div>`;
  }

  const extraHTML = resp.extraHTML || '';

  group.innerHTML = `
    <div class="msg-avatar bot-av" aria-label="PayrollAI" aria-hidden="true">\uD83E\uDD16</div>
    <div class="msg-bubble">
      <div class="msg-content">${renderMarkdown(resp.text)}${cardHTML}${escalateHTML}${extraHTML}</div>
      <div class="msg-time">PayrollAI \u00b7 ${timeStr}</div>
    </div>
  `;

  // Bind date-range picker buttons
  group.querySelectorAll('.date-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const month = btn.getAttribute('data-month');
      messageInput.value = month;
      sendMessage();
    });
  });

  messagesArea.appendChild(group);
  scrollToBottom();

  if (!isHistoryLoad) {
    saveToHistory({ type: 'bot', resp, time: timeStr });
  }
}

function showTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typing-indicator';
  el.setAttribute('aria-label', 'PayrollAI is typing');
  el.innerHTML = `
    <div class="msg-avatar bot-av" aria-hidden="true">\uD83E\uDD16</div>
    <div class="typing-dots"><span></span><span></span><span></span></div>
  `;
  messagesArea.appendChild(el);
  scrollToBottom();
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

function scrollToBottom() {
  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
}

// -- Info button --
document.getElementById('info-btn').addEventListener('click', () => {
  if (isBotTyping) return;
  welcomeBanner.style.display = 'none';
  appendBotMessage(RESPONSES.default());
});



// -- Shared UI Trigger for Quick Buttons --
function sendMessageFromUI(text) {
  messageInput.value = text;
  sendMessage();
}

// -- Jira Ticket Escalation Handler --
async function handleEscalateTicket(btn) {
  // Show loading state
  btn.textContent = 'Creating ticket…';
  btn.disabled = true;

  try {
    const response = await fetch('http://localhost:5000/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeNumber: PAYROLL_DATA?.employeeNumber || 'UNKNOWN',
        summary: 'HR Escalation from PayrollAI',
        description: `Employee ${PAYROLL_DATA?.employeeNumber || 'UNKNOWN'} has requested to speak with an HR advisor via the PayrollAI chatbot.`
      })
    });

    const data = await response.json();

    if (data.success) {
      // Replace the entire escalation card with a success confirmation
      const card = btn.closest('.escalate-card');
      card.innerHTML = `
        <span class="esc-icon" aria-hidden="true">\u2705</span>
        <div class="esc-text">
          <strong>Ticket Created: ${data.ticketKey}</strong>
          <p>An HR advisor will be in touch shortly. <a href="${data.ticketUrl}" target="_blank" rel="noopener" style="color:var(--pink);text-decoration:underline">View Ticket</a></p>
        </div>
      `;
    } else {
      btn.textContent = 'Error — try again';
      btn.disabled = false;
      console.error('Ticket creation failed:', data.error);
    }
  } catch (error) {
    btn.textContent = 'Error — try again';
    btn.disabled = false;
    console.error('Failed to create ticket:', error);
  }
}

// -- Account Update flow --
function handleAccountUpdateFlow(text) {
  const input = text.trim().toLowerCase();

  if (input === 'yes' || input === 'yes, send link' || input.includes('yes')) {
    appendBotMessage({
      text: `Okay, here is the secure link to the self-service portal: <a href="https://peoplefirst.mhr.co.uk/" target="_blank" style="color:var(--pink);text-decoration:underline">People First</a>.\n\nPlease log in and follow the steps to update your bank details. Let me know if you have any other questions!`
    });
  } else {
    appendBotMessage({
      text: `No problem! I will cancel that request. What else can I help you with today?`
    });
  }
  // End flow
  chatState = { activeFlow: null, step: null, data: {} };
}
// ==============================================
//  LOCAL STORAGE CHAT SESSIONS
// ==============================================
function getHistoryKey() {
  return PAYROLL_DATA?.employeeNumber ? `chatSessions_${PAYROLL_DATA.employeeNumber}` : null;
}

function getSessions() {
  const key = getHistoryKey();
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    return [];
  }
}

function saveSessions(sessions) {
  const key = getHistoryKey();
  if (key) localStorage.setItem(key, JSON.stringify(sessions));
  // Also sync to server for physical file persistence
  syncToServer(sessions);
}

// Sync chat sessions to a server-side text file for physical persistence
function syncToServer(sessions) {
  const empId = PAYROLL_DATA?.employeeNumber;
  if (!empId || sessions.length === 0) return;

  fetch('http://localhost:5000/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNumber: empId, sessions: sessions })
  }).catch(err => console.warn('Could not sync chat to server:', err));
}

function saveToHistory(msgObj) {
  const sessions = getSessions();

  if (!activeChatId) {
    // Start a new session and generate a title based on the first prompt
    let title = 'New Chat';
    if (msgObj.type === 'user') {
      title = msgObj.text.length > 25 ? msgObj.text.substring(0, 25) + '...' : msgObj.text;
    }

    activeChatId = Date.now().toString();
    sessions.unshift({
      id: activeChatId,
      title: title,
      messages: [msgObj]
    });
  } else {
    // Append to existing active session
    const sessionIndex = sessions.findIndex(s => s.id === activeChatId);
    if (sessionIndex > -1) {
      sessions[sessionIndex].messages.push(msgObj);
      
      // Bring active session to the top of the list if it's not already
      if (sessionIndex !== 0) {
        const activeSession = sessions.splice(sessionIndex, 1)[0];
        sessions.unshift(activeSession);
      }
    }
  }

  saveSessions(sessions);
  renderSidebarChats();
}

function loadChatHistory() {
  // Wipe out the old single-session prototype architecture safely
  if (PAYROLL_DATA?.employeeNumber) {
    localStorage.removeItem(`chatHistory_${PAYROLL_DATA.employeeNumber}`);
  }
  
  renderSidebarChats();
  
  // Auto-load most recent chat if one exists
  const sessions = getSessions();
  if (sessions.length > 0) {
    loadSession(sessions[0].id);
  }
}

function renderSidebarChats() {
  const list = document.getElementById('chat-list');
  const label = document.querySelector('.sidebar-section-label');
  const sessions = getSessions();

  if (!list) return;

  list.innerHTML = '';

  if (sessions.length === 0) {
    if (label) label.style.display = 'none';
    return;
  }

  if (label) label.style.display = 'block';

  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'chat-item';
    if (session.id === activeChatId) item.classList.add('active');

    // Chat title text
    const titleSpan = document.createElement('span');
    titleSpan.className = 'chat-item-title';
    titleSpan.innerHTML = `<span class="dot" aria-hidden="true"></span>${session.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'chat-delete-btn';
    delBtn.title = 'Delete chat';
    delBtn.setAttribute('aria-label', 'Delete chat');
    delBtn.innerHTML = '&times;';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(session.id);
    });

    item.appendChild(titleSpan);
    item.appendChild(delBtn);

    item.addEventListener('click', (e) => {
      document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      loadSession(session.id);
      closeSidebar();
    });

    list.appendChild(item);
  });
}

function deleteSession(id) {
  let sessions = getSessions();
  sessions = sessions.filter(s => s.id !== id);
  saveSessions(sessions);

  // If the deleted session was the active one, clear the chat area
  if (activeChatId === id) {
    activeChatId = null;
    document.querySelectorAll('.message-group, .typing-indicator').forEach(el => el.remove());
    welcomeBanner.style.display = 'block';
  }

  renderSidebarChats();
}

function loadSession(id) {
  const sessions = getSessions();
  const session = sessions.find(s => s.id === id);
  if (!session) return;

  activeChatId = id;
  document.querySelectorAll('.message-group, .typing-indicator').forEach(el => el.remove());
  welcomeBanner.style.display = 'none';

  session.messages.forEach(msg => {
    if (msg.type === 'user') {
      appendMessage(msg.role, msg.text, true, msg.time);
    } else if (msg.type === 'bot') {
      appendBotMessage(msg.resp, true, msg.time);
    }
  });

  scrollToBottom();
}

