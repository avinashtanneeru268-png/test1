/**
 * ==============================================================================
 * BUNNY AI — Frontend Application Controller
 * "Bunny AI — Your Personal Assistant"
 * 
 * Features:
 * - Premium Startup Animation with reduced-motion support
 * - Central OpenAI Integration & Responses API streaming
 * - Real-time Model Verification & Safe Fallbacks
 * - Custom Animated Typing Indicator
 * - Interactive Voice Assistant Mode (Whisper STT & TTS-1 with WebSpeech fallback)
 * - Conversation Persistence (Supabase cloud sync + offline LocalStorage fallback)
 * - Conversation Rename & Deletion
 * - Copy, Regenerate, Stop Generation, and Smart Auto-Scroll
 * ==============================================================================
 */

// Determine API base: relative if hosted on backend port, else http://localhost:5000
const API_BASE = (window.location.port === '5000') ? '' : 'http://localhost:5000';

// Global Application State
const state = {
  conversation: [],
  activeConversationId: null,
  selectedModel: localStorage.getItem('bunny_model') || 'gpt-6-luna',
  customApiKey: localStorage.getItem('bunny_api_key') || '',
  systemPrompt: localStorage.getItem('bunny_system_prompt') || '',
  temperature: parseFloat(localStorage.getItem('bunny_temperature')) || 0.7,
  isStreaming: localStorage.getItem('bunny_streaming') !== 'false',

  // Supabase Configuration
  supabaseUrl: localStorage.getItem('supabase_url') || '',
  supabaseAnonKey: localStorage.getItem('supabase_anon_key') || '',
  hasSupabase: false,
  supabaseClient: null,
  savedConversations: [],

  // Diagnostics & Status
  backendHasApiKey: false,
  defaultModel: 'gpt-6-luna',
  fallbackModel: 'gpt-4o-mini',
  isGenerating: false,
  abortController: null,

  // Voice Assistant State
  voice: {
    isOpen: false,
    isListening: false,
    isSpeaking: false,
    isMuted: localStorage.getItem('bunny_voice_muted') === 'true',
    currentAudio: null,
    lastSpokenText: '',
    mediaRecorder: null,
    audioChunks: [],
    speechRecognition: null
  }
};

// Cached DOM Elements
const elements = {
  // Startup Animation
  startupScreen: document.getElementById('startup-screen'),
  startupLoaderBar: document.getElementById('startup-loader-bar'),
  startupStatusText: document.getElementById('startup-status-text'),
  btnSkipStartup: document.getElementById('btn-skip-startup'),

  // Brand & Navigation
  brandHeaderIcon: document.getElementById('brand-header-icon'),
  connectionStatus: document.getElementById('connection-status'),
  statusLabel: document.getElementById('status-label'),
  modelSelect: document.getElementById('model-select'),
  currentModelBadge: document.getElementById('current-model-badge'),
  dockModelName: document.getElementById('dock-model-name'),
  btnOpenVoice: document.getElementById('btn-open-voice'),
  btnApiKeyModal: document.getElementById('btn-api-key-modal'),
  apiKeyStatusText: document.getElementById('api-key-status-text'),
  btnSupabaseStatus: document.getElementById('btn-supabase-status'),
  supabaseStatusText: document.getElementById('supabase-status-text'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  btnClearChat: document.getElementById('btn-clear-chat'),
  btnExportChat: document.getElementById('btn-export-chat'),
  btnSettings: document.getElementById('btn-settings'),

  // History Sidebar Drawer
  historySidebar: document.getElementById('history-sidebar'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),
  btnNewChat: document.getElementById('btn-new-chat'),
  btnClearAllHistory: document.getElementById('btn-clear-all-history'),
  sidebarSyncBadge: document.getElementById('sidebar-sync-badge'),
  sidebarSyncText: document.getElementById('sidebar-sync-text'),
  conversationsList: document.getElementById('conversations-list'),

  // Chat Viewport
  chatViewport: document.getElementById('chat-viewport'),
  welcomeContainer: document.getElementById('welcome-container'),
  messagesList: document.getElementById('messages-list'),
  suggestionCards: document.querySelectorAll('.suggestion-card'),

  // Input Dock
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  btnMicInput: document.getElementById('btn-mic-input'),
  btnSend: document.getElementById('btn-send'),
  btnStop: document.getElementById('btn-stop'),
  charCount: document.getElementById('char-count'),
  streamingBadge: document.getElementById('streaming-badge'),

  // Voice Assistant Modal
  voiceModal: document.getElementById('voice-modal'),
  btnCloseVoice: document.getElementById('btn-close-voice'),
  voiceOrb: document.getElementById('voice-orb'),
  voiceVisualizer: document.querySelector('.voice-visualizer-container'),
  voiceStatusHeading: document.getElementById('voice-status-heading'),
  voiceStatusSubtext: document.getElementById('voice-status-subtext'),
  voiceTranscriptBox: document.getElementById('voice-transcript-box'),
  voiceTranscriptText: document.getElementById('voice-transcript-text'),
  voiceAlert: document.getElementById('voice-alert'),
  voiceAlertText: document.getElementById('voice-alert-text'),
  btnVoiceAction: document.getElementById('btn-voice-action'),
  btnVoiceMute: document.getElementById('btn-voice-mute'),
  btnVoiceReplay: document.getElementById('btn-voice-replay'),

  // Settings Modal
  settingsModal: document.getElementById('settings-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  aiStatusDetail: document.getElementById('ai-status-detail'),
  inputApiKey: document.getElementById('input-api-key'),
  btnToggleKeyVisibility: document.getElementById('btn-toggle-key-visibility'),
  modalModelSelect: document.getElementById('modal-model-select'),
  btnVerifyModel: document.getElementById('btn-verify-model'),
  modelVerifyFeedback: document.getElementById('model-verify-feedback'),
  inputSystemPrompt: document.getElementById('input-system-prompt'),
  inputTemperature: document.getElementById('input-temperature'),
  tempDisplay: document.getElementById('temp-display'),
  toggleStreaming: document.getElementById('toggle-streaming'),
  supabaseStatusDetail: document.getElementById('supabase-status-detail'),
  inputSupabaseUrl: document.getElementById('input-supabase-url'),
  inputSupabaseAnonKey: document.getElementById('input-supabase-anon-key'),
  btnReplayStartup: document.getElementById('btn-replay-startup'),
  btnTestSupabase: document.getElementById('btn-test-supabase'),
  btnSaveSettings: document.getElementById('btn-save-settings'),

  // Toast Container
  toastContainer: document.getElementById('toast-container')
};

/* ==============================================================================
   INITIALIZATION
   ============================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initStartupAnimation();
  setupMarkdownRenderer();
  bindEvents();
  loadSavedSettings();
  await loadAppConfig();
  await fetchAvailableModels();
  await loadSavedConversations();
});

/* ==============================================================================
   PREMIUM STARTUP ANIMATION
   ============================================================================== */
function initStartupAnimation() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    elements.startupScreen.classList.add('dismissed');
    return;
  }

  let progress = 10;
  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 25) + 15;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      elements.startupLoaderBar.style.width = '100%';
      elements.startupStatusText.textContent = 'Bunny AI Ready';
      setTimeout(dismissStartupAnimation, 350);
    } else {
      elements.startupLoaderBar.style.width = `${progress}%`;
      if (progress > 40) elements.startupStatusText.textContent = 'Connecting neural pathways...';
      if (progress > 75) elements.startupStatusText.textContent = 'Synchronizing personality matrix...';
    }
  }, 160);

  // Allow instant skip on click or keypress
  elements.startupScreen.addEventListener('click', dismissStartupAnimation);
  elements.btnSkipStartup.addEventListener('click', dismissStartupAnimation);
}

function dismissStartupAnimation() {
  if (!elements.startupScreen.classList.contains('dismissed')) {
    elements.startupScreen.classList.add('dismissed');
  }
}

function replayStartupAnimation() {
  elements.startupScreen.classList.remove('dismissed');
  elements.startupLoaderBar.style.width = '0%';
  elements.startupStatusText.textContent = 'Initializing neural interface...';
  closeModal();
  initStartupAnimation();
}

/* ==============================================================================
   MARKDOWN RENDERER SETUP
   ============================================================================== */
function setupMarkdownRenderer() {
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function (code, lang) {
        if (window.hljs && lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {
            console.error(e);
          }
        }
        return code;
      }
    });
  }
}

/* ==============================================================================
   APP CONFIG & BACKEND CONNECTION
   ============================================================================== */
async function loadAppConfig() {
  try {
    elements.statusLabel.textContent = 'Connecting...';
    const res = await fetch(`${API_BASE}/api/config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const config = await res.json();
    state.backendHasApiKey = config.hasApiKey;
    state.defaultModel = config.defaultModel || 'gpt-6-luna';
    state.fallbackModel = config.fallbackModel || 'gpt-4o-mini';

    // Model selection fallback if needed
    if (!state.selectedModel) {
      state.selectedModel = state.defaultModel;
    }
    updateModelBadges(state.selectedModel);

    // Update Connection Status Pill
    elements.connectionStatus.querySelector('.status-dot').className = 'status-dot online';
    elements.statusLabel.textContent = 'Online & Ready';

    // Update API Key Status
    if (state.backendHasApiKey || state.customApiKey) {
      elements.btnApiKeyModal.classList.add('active');
      elements.btnApiKeyModal.classList.remove('warning');
      elements.apiKeyStatusText.textContent = 'OpenAI Ready';
      elements.aiStatusDetail.textContent = state.backendHasApiKey
        ? '✅ OpenAI API Key detected in server backend/.env.'
        : '✅ Custom OpenAI API Key configured in browser.';
    } else {
      elements.btnApiKeyModal.classList.remove('active');
      elements.btnApiKeyModal.classList.add('warning');
      elements.apiKeyStatusText.textContent = 'Set API Key';
      elements.aiStatusDetail.textContent = '⚠️ No OpenAI Key detected. Add OPENAI_API_KEY in backend/.env or enter below.';
    }

    // Configure Supabase if provided by backend
    if (config.supabaseUrl && config.supabaseAnonKey) {
      state.supabaseUrl = config.supabaseUrl;
      state.supabaseAnonKey = config.supabaseAnonKey;
      initSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);

      // Verify if database schema & tables are actually ready
      try {
        const statusRes = await fetch(`${API_BASE}/api/supabase/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.configured && !statusData.tablesReady) {
            updateSupabaseUIStatus(false, 'Supabase tables pending creation. Run migration in Supabase SQL Editor. Offline memory active.');
          } else if (statusData.configured && statusData.tablesReady) {
            updateSupabaseUIStatus(true, 'Connected to Supabase PostgreSQL');
          }
        }
      } catch (e) {
        // Soft fallback
      }
    } else if (state.supabaseUrl && state.supabaseAnonKey) {
      initSupabaseClient(state.supabaseUrl, state.supabaseAnonKey);
    } else {
      updateSupabaseUIStatus(false, 'Local offline memory active (Supabase not configured)');
    }
  } catch (err) {
    console.warn('[Bunny AI] Could not reach backend /api/config:', err.message);
    elements.connectionStatus.querySelector('.status-dot').className = 'status-dot';
    elements.statusLabel.textContent = 'Backend Offline';
    updateSupabaseUIStatus(false, 'Backend API offline');
  }
}

async function fetchAvailableModels() {
  try {
    const res = await fetch(`${API_BASE}/api/models`);
    if (!res.ok) return;
    const data = await res.json();

    if (Array.isArray(data.models)) {
      elements.modelSelect.innerHTML = '';
      elements.modalModelSelect.innerHTML = '';

      for (const m of data.models) {
        const opt1 = document.createElement('option');
        opt1.value = m.id;
        opt1.textContent = `${m.name} (${m.badge})`;
        if (m.id === state.selectedModel) opt1.selected = true;
        elements.modelSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = m.id;
        opt2.textContent = `${m.name} (${m.badge})`;
        if (m.id === state.selectedModel) opt2.selected = true;
        elements.modalModelSelect.appendChild(opt2);
      }
    }
  } catch (err) {
    console.warn('[Bunny AI] Could not fetch models list:', err.message);
  }
}

function updateModelBadges(modelId) {
  const prettyName = modelId
    .replace('gpt-6-', 'GPT-6 ')
    .replace('gpt-4o-mini', 'GPT-4o Mini')
    .replace('gpt-4o', 'GPT-4o')
    .replace(/\b\w/g, l => l.toUpperCase());

  elements.currentModelBadge.textContent = prettyName;
  elements.dockModelName.textContent = prettyName;
  if (elements.modelSelect.value !== modelId) elements.modelSelect.value = modelId;
  if (elements.modalModelSelect.value !== modelId) elements.modalModelSelect.value = modelId;
}

/* ==============================================================================
   SUPABASE INTEGRATION
   ============================================================================== */
function initSupabaseClient(url, key) {
  if (!url || !key || url.includes('your-project') || key.includes('your_supabase_')) {
    updateSupabaseUIStatus(false, 'Supabase credentials not configured in .env');
    return;
  }

  try {
    if (window.supabase) {
      state.supabaseClient = window.supabase.createClient(url, key);
      state.hasSupabase = true;
      updateSupabaseUIStatus(true, 'Connected to Supabase PostgreSQL');
    } else {
      updateSupabaseUIStatus(false, 'Supabase JS library not loaded');
    }
  } catch (err) {
    console.error('[Bunny AI] Supabase initialization error:', err);
    updateSupabaseUIStatus(false, err.message);
  }
}

function updateSupabaseUIStatus(isConnected, message) {
  state.hasSupabase = isConnected;
  elements.supabaseStatusDetail.textContent = message;

  if (isConnected) {
    elements.btnSupabaseStatus.classList.add('active');
    elements.btnSupabaseStatus.classList.remove('warning');
    elements.supabaseStatusText.textContent = 'Cloud Sync';
    elements.sidebarSyncBadge.style.display = 'flex';
    elements.sidebarSyncText.textContent = 'Supabase Synced';
  } else {
    elements.btnSupabaseStatus.classList.remove('active');
    elements.supabaseStatusText.textContent = 'Local Mode';
    elements.sidebarSyncBadge.style.display = 'flex';
    elements.sidebarSyncText.textContent = 'Offline Local Memory';
  }
}

async function loadSavedConversations() {
  let loadedFromServer = false;

  // If Supabase is available via backend API and tables exist
  try {
    const res = await fetch(`${API_BASE}/api/conversations`);
    if (res.ok) {
      const data = await res.json();
      if (data.configured && data.tablesReady && Array.isArray(data.conversations) && data.conversations.length > 0) {
        state.savedConversations = data.conversations;
        renderConversationsList();
        loadedFromServer = true;
      }
    }
  } catch (e) {
    console.log('[Bunny AI] Server conversations endpoint standby:', e.message);
  }

  // LocalStorage Fallback if server tables are not ready or empty
  if (!loadedFromServer) {
    try {
      const local = localStorage.getItem('bunny_conversations');
      if (local) {
        state.savedConversations = JSON.parse(local);
      } else {
        state.savedConversations = [];
      }
      renderConversationsList();
    } catch (e) {
      state.savedConversations = [];
    }
  }
}

function renderConversationsList() {
  if (!state.savedConversations || state.savedConversations.length === 0) {
    elements.conversationsList.innerHTML = `
      <div class="sidebar-empty-state">
        <p>No saved conversations yet.</p>
        <span>Send a message to start and auto-save!</span>
      </div>`;
    return;
  }

  elements.conversationsList.innerHTML = '';
  for (const conv of state.savedConversations) {
    const item = document.createElement('div');
    item.className = `conversation-item ${conv.id === state.activeConversationId ? 'active' : ''}`;
    item.dataset.id = conv.id;

    item.innerHTML = `
      <span class="conv-title" title="${escapeHtml(conv.title || 'Untitled')}">
        ${escapeHtml(conv.title || 'Untitled')}
      </span>
      <div class="conv-actions">
        <button class="btn-conv-action btn-rename" title="Rename Conversation" data-id="${conv.id}">
          ✏️
        </button>
        <button class="btn-conv-action btn-delete" title="Delete Conversation" data-id="${conv.id}">
          🗑️
        </button>
      </div>
    `;

    // Click on item selects conversation
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-conv-action')) return;
      selectConversation(conv.id);
    });

    // Rename button
    const renameBtn = item.querySelector('.btn-rename');
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promptRenameConversation(conv.id, conv.title);
    });

    // Delete button
    const deleteBtn = item.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });

    elements.conversationsList.appendChild(item);
  }
}

async function selectConversation(convId) {
  state.activeConversationId = convId;
  renderConversationsList();
  closeSidebar();

  // Fetch messages from backend
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${convId}/messages`);
    if (res.ok) {
      const msgs = await res.json();
      if (Array.isArray(msgs) && msgs.length > 0) {
        state.conversation = msgs.map(m => ({
          role: m.role,
          content: m.content
        }));
        renderChatMessages();
        return;
      }
    }
  } catch (e) {
    console.warn('[Bunny AI] Could not fetch conversation messages from server:', e);
  }

  // Local storage fallback for messages
  const localMsgs = localStorage.getItem(`bunny_msgs_${convId}`);
  if (localMsgs) {
    state.conversation = JSON.parse(localMsgs);
    renderChatMessages();
  }
}

async function promptRenameConversation(convId, currentTitle) {
  const newTitle = prompt('Rename conversation:', currentTitle);
  if (!newTitle || newTitle.trim().length === 0 || newTitle.trim() === currentTitle) return;

  const trimmed = newTitle.trim();

  // Try backend PATCH
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed })
    });
    if (res.ok) {
      showToast('Conversation renamed', 'success');
    }
  } catch (err) {
    console.warn('[Bunny AI] Remote rename failed, updating locally:', err);
  }

  // Update local state
  const found = state.savedConversations.find(c => c.id === convId);
  if (found) found.title = trimmed;
  localStorage.setItem('bunny_conversations', JSON.stringify(state.savedConversations));
  renderConversationsList();
}

async function deleteConversation(convId) {
  if (!confirm('Are you sure you want to delete this conversation?')) return;

  // Try backend DELETE
  try {
    await fetch(`${API_BASE}/api/conversations/${convId}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('[Bunny AI] Remote delete failed:', err);
  }

  // Remove locally
  state.savedConversations = state.savedConversations.filter(c => c.id !== convId);
  localStorage.setItem('bunny_conversations', JSON.stringify(state.savedConversations));
  localStorage.removeItem(`bunny_msgs_${convId}`);

  if (state.activeConversationId === convId) {
    startNewChat();
  } else {
    renderConversationsList();
  }
  showToast('Conversation deleted', 'success');
}

function clearAllConversations() {
  if (!confirm('Clear all conversation history? This cannot be undone.')) return;

  for (const conv of state.savedConversations) {
    localStorage.removeItem(`bunny_msgs_${conv.id}`);
  }
  state.savedConversations = [];
  localStorage.setItem('bunny_conversations', JSON.stringify([]));
  startNewChat();
  renderConversationsList();
  showToast('All conversation history cleared', 'success');
}

function startNewChat() {
  state.activeConversationId = null;
  state.conversation = [];
  renderChatMessages();
  renderConversationsList();
  elements.chatInput.focus();
  closeSidebar();
}

/* ==============================================================================
   CHAT INTERFACE & STREAMING CONTROLLER
   ============================================================================== */
function renderChatMessages() {
  if (state.conversation.length === 0) {
    elements.welcomeContainer.classList.remove('hidden');
    elements.messagesList.innerHTML = '';
  } else {
    elements.welcomeContainer.classList.add('hidden');
    elements.messagesList.innerHTML = '';

    for (let i = 0; i < state.conversation.length; i++) {
      const msg = state.conversation[i];
      appendMessageBubble(msg.role, msg.content, i);
    }
    smartScrollToBottom();
  }
}

function appendMessageBubble(role, content = '', index = -1) {
  const isAssistant = (role === 'assistant' || role === 'model');
  const row = document.createElement('div');
  row.className = `message-row ${isAssistant ? 'assistant' : 'user'}`;
  if (index >= 0) row.dataset.index = index;

  let formattedContent = '';
  if (window.marked && content) {
    formattedContent = marked.parse(content);
  } else {
    formattedContent = `<p>${escapeHtml(content)}</p>`;
  }

  if (isAssistant) {
    row.innerHTML = `
      <div class="message-avatar assistant">
        <img src="bunny-logo.svg" alt="Bunny AI">
      </div>
      <div class="message-bubble">
        <div class="message-header-meta">
          <span class="assistant-tag">
            <span>🐰 Bunny AI</span>
            <span class="model-tag">${escapeHtml(state.selectedModel)}</span>
          </span>
          <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="message-content">${formattedContent}</div>
        <div class="message-actions">
          <button class="btn-msg-action btn-copy-msg" title="Copy response to clipboard">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 2.57A2 2 0 0014.685 2H10a2 2 0 00-2 2z"/><path d="M16 18v2a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2"/></svg>
            <span>Copy</span>
          </button>
          <button class="btn-msg-action btn-speak-msg" title="Speak this response (Voice synthesis)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <span>Speak</span>
          </button>
          <button class="btn-msg-action btn-regenerate-msg" title="Regenerate this response">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            <span>Regenerate</span>
          </button>
        </div>
      </div>
    `;

    // Attach Action Listeners
    const copyBtn = row.querySelector('.btn-copy-msg');
    copyBtn.addEventListener('click', () => copyMessageText(content, copyBtn));

    const speakBtn = row.querySelector('.btn-speak-msg');
    speakBtn.addEventListener('click', () => speakText(content));

    const regenBtn = row.querySelector('.btn-regenerate-msg');
    regenBtn.addEventListener('click', () => regenerateResponse(index));

  } else {
    row.innerHTML = `
      <div class="message-avatar user">
        <span>You</span>
      </div>
      <div class="message-bubble">
        <div class="message-header-meta">
          <span class="user-tag">You</span>
          <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="message-content">${formattedContent}</div>
      </div>
    `;
  }

  attachCodeBlockCopyButtons(row);
  elements.messagesList.appendChild(row);
  return row;
}

function attachCodeBlockCopyButtons(container) {
  const preElements = container.querySelectorAll('pre');
  preElements.forEach((pre) => {
    if (pre.querySelector('.code-block-header')) return;

    const code = pre.querySelector('code');
    const header = document.createElement('div');
    header.className = 'code-block-header';
    header.innerHTML = `
      <span>Code</span>
      <button class="btn-copy-code" title="Copy code snippet">Copy</button>
    `;

    const copyBtn = header.querySelector('.btn-copy-code');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });

    pre.insertBefore(header, pre.firstChild);
  });
}

function copyMessageText(text, btnElement) {
  navigator.clipboard.writeText(text).then(() => {
    btnElement.classList.add('copied');
    btnElement.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      btnElement.classList.remove('copied');
      btnElement.querySelector('span').textContent = 'Copy';
    }, 2000);
  });
}

/* Smart Auto-Scroll: does not interrupt reading if user scrolled up */
function smartScrollToBottom() {
  const viewport = elements.chatViewport;
  const isNearBottom = viewport.scrollHeight - viewport.scrollTop <= viewport.clientHeight + 140;
  if (isNearBottom) {
    viewport.scrollTop = viewport.scrollHeight;
  }
}

/* Send Message Handler */
async function handleSendMessage(customPrompt = null) {
  if (state.isGenerating) return;

  const text = (customPrompt !== null ? customPrompt : elements.chatInput.value).trim();
  if (!text) return;

  // Add user message to state
  state.conversation.push({ role: 'user', content: text });
  elements.chatInput.value = '';
  updateCharCount();
  renderChatMessages();

  // Create Assistant Placeholder Bubble with Typing Indicator
  const assistantRow = document.createElement('div');
  assistantRow.className = 'message-row assistant';
  assistantRow.innerHTML = `
    <div class="message-avatar assistant">
      <img src="bunny-logo.svg" alt="Bunny AI">
    </div>
    <div class="message-bubble">
      <div class="message-header-meta">
        <span class="assistant-tag">
          <span>🐰 Bunny AI</span>
          <span class="model-tag">${escapeHtml(state.selectedModel)}</span>
        </span>
      </div>
      <div class="message-content">
        <div class="typing-indicator-container">
          <div class="typing-dots">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
          <span class="typing-label">Bunny is thinking...</span>
        </div>
      </div>
    </div>
  `;
  elements.messagesList.appendChild(assistantRow);
  smartScrollToBottom();

  const contentElement = assistantRow.querySelector('.message-content');

  // Set Generating UI State
  state.isGenerating = true;
  elements.btnSend.classList.add('hidden');
  elements.btnStop.classList.remove('hidden');

  state.abortController = new AbortController();

  let accumulatedReply = '';
  const historyToSend = state.conversation.slice(0, -1);

  const requestHeaders = { 'Content-Type': 'application/json' };
  if (state.customApiKey) {
    requestHeaders['x-api-key'] = state.customApiKey;
  }

  const requestPayload = {
    message: text,
    history: historyToSend,
    model: state.selectedModel,
    temperature: state.temperature,
    systemPrompt: state.systemPrompt,
    conversationId: state.activeConversationId
  };

  try {
    if (state.isStreaming) {
      // Real-time SSE Streaming
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestPayload),
        signal: state.abortController.signal
      });

      if (!response.ok && response.status !== 200) {
        throw new Error(`HTTP ${response.status}: Stream connection failed`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let firstTokenReceived = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const rawText = decoder.decode(value, { stream: true });
        const lines = rawText.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.error) {
              throw new Error(data.error);
            }

            if (data.conversationId) {
              state.activeConversationId = data.conversationId;
            }

            if (data.meta && data.meta.fallbackTriggered) {
              showToast(`Primary model unavailable. Using ${data.meta.fallbackModel}.`, 'warning');
            }

            if (data.text) {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                contentElement.innerHTML = '';
              }
              accumulatedReply += data.text;
              contentElement.innerHTML = marked.parse(accumulatedReply);
              attachCodeBlockCopyButtons(assistantRow);
              smartScrollToBottom();
            }
          } catch (pe) {
            if (pe.message && !pe.message.includes('JSON')) throw pe;
          }
        }
      }
    } else {
      // Standard Non-Streaming Request
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestPayload),
        signal: state.abortController.signal
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      accumulatedReply = data.reply || '';
      if (data.conversationId) state.activeConversationId = data.conversationId;

      contentElement.innerHTML = marked.parse(accumulatedReply);
      attachCodeBlockCopyButtons(assistantRow);
    }

    // Finished successfully
    if (accumulatedReply.trim().length > 0) {
      state.conversation.push({ role: 'assistant', content: accumulatedReply });
      persistConversationLocally();
      loadSavedConversations();
      renderChatMessages(); // Re-render to attach full actions
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      contentElement.innerHTML += `<p class="text-muted" style="color: #71717A; font-style: italic;">[Generation stopped by user]</p>`;
      if (accumulatedReply.trim().length > 0) {
        state.conversation.push({ role: 'assistant', content: accumulatedReply });
        persistConversationLocally();
      }
    } else {
      console.error('[Bunny AI] Chat error:', error);
      const isKeyError = error.message.toLowerCase().includes('api key') || error.message.toLowerCase().includes('auth');
      const isQuotaError = error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('credit') || error.message.toLowerCase().includes('billing');
      const isModelError = error.message.toLowerCase().includes('model');

      let actionHint = '';
      if (isQuotaError) {
        actionHint = `
          <div style="margin-top: 8px; font-size: 0.85rem; color: #ff8099;">
            💳 <strong>OpenAI Quota Limit:</strong> Your OpenAI account has exhausted its API credit balance.
            <br>
            Add credits at <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noopener" style="color: #fff; text-decoration: underline;">platform.openai.com/billing</a> or set a new API key in <a href="#" id="link-chat-settings" style="color: #fff; text-decoration: underline;">Settings</a>.
          </div>`;
      } else if (isKeyError) {
        actionHint = `
          <div style="margin-top: 8px; font-size: 0.85rem; color: #ff8099;">
            🔑 <strong>OpenAI Key Required:</strong> Configure <code>OPENAI_API_KEY</code> in <code>backend/.env</code> or enter your key in <a href="#" id="link-chat-settings" style="color: #fff; text-decoration: underline;">Settings</a>.
          </div>`;
      }

      contentElement.innerHTML = `
        <div class="voice-alert" style="margin-top: 0;">
          <strong>Error:</strong> ${escapeHtml(error.message)}
          ${actionHint}
          <div style="margin-top: 8px; display: flex; gap: 8px;">
            <button class="btn-primary btn-sm" id="btn-retry-chat">
              Retry Message
            </button>
          </div>
        </div>`;

      const settingsLink = contentElement.querySelector('#link-chat-settings');
      if (settingsLink) {
        settingsLink.addEventListener('click', (e) => {
          e.preventDefault();
          openModal();
        });
      }

      const retryBtn = contentElement.querySelector('#btn-retry-chat');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          assistantRow.remove();
          state.conversation.pop(); // Remove user msg to re-send
          handleSendMessage(text);
        });
      }

      if (isKeyError) {
        showToast('OpenAI API key missing or invalid. Check settings.', 'error');
      } else if (isQuotaError) {
        showToast('OpenAI quota exceeded. Please check billing.', 'error');
      } else if (isModelError) {
        showToast('Configured model is unavailable.', 'error');
      }
    }
  } finally {
    state.isGenerating = false;
    elements.btnSend.classList.remove('hidden');
    elements.btnStop.classList.add('hidden');
    smartScrollToBottom();
  }
}

function stopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
}

function regenerateResponse(assistantIndex) {
  if (state.isGenerating) return;
  // Find preceding user message
  let userMsg = '';
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (state.conversation[i].role === 'user') {
      userMsg = state.conversation[i].content;
      break;
    }
  }
  if (!userMsg) return;

  // Trim conversation up to assistant message
  state.conversation = state.conversation.slice(0, assistantIndex);
  handleSendMessage(userMsg);
}

function persistConversationLocally() {
  if (state.conversation.length === 0) return;

  // Auto-generate ID if needed
  if (!state.activeConversationId) {
    state.activeConversationId = 'local_' + Date.now();
    const firstUserMsg = state.conversation.find(m => m.role === 'user')?.content || 'New Conversation';
    const title = firstUserMsg.slice(0, 42) + (firstUserMsg.length > 42 ? '...' : '');

    state.savedConversations.unshift({
      id: state.activeConversationId,
      title,
      model: state.selectedModel,
      updated_at: new Date().toISOString()
    });
    localStorage.setItem('bunny_conversations', JSON.stringify(state.savedConversations));
  }

  localStorage.setItem(`bunny_msgs_${state.activeConversationId}`, JSON.stringify(state.conversation));
}

/* ==============================================================================
   BUNNY VOICE ASSISTANT CONTROLLER
   ============================================================================== */
function openVoiceModal() {
  elements.voiceModal.classList.remove('hidden');
  state.voice.isOpen = true;
  setVoiceState('IDLE');
}

function closeVoiceModal() {
  elements.voiceModal.classList.add('hidden');
  state.voice.isOpen = false;
  stopVoiceAudio();
  stopVoiceRecording();
}

function setVoiceState(stateName) {
  elements.voiceOrb.className = 'voice-orb';
  elements.voiceVisualizer.classList.remove('active');
  elements.voiceAlert.classList.add('hidden');

  switch (stateName) {
    case 'IDLE':
      elements.voiceStatusHeading.textContent = 'Talk to Bunny';
      elements.voiceStatusSubtext.textContent = 'Tap the microphone to speak.';
      elements.btnVoiceAction.classList.remove('recording');
      state.voice.isListening = false;
      state.voice.isSpeaking = false;
      break;

    case 'LISTENING':
      elements.voiceStatusHeading.textContent = 'Bunny is listening...';
      elements.voiceStatusSubtext.textContent = 'Speak clearly into your microphone.';
      elements.voiceOrb.classList.add('listening');
      elements.voiceVisualizer.classList.add('active');
      elements.btnVoiceAction.classList.add('recording');
      state.voice.isListening = true;
      state.voice.isSpeaking = false;
      break;

    case 'THINKING':
      elements.voiceStatusHeading.textContent = 'Bunny is thinking...';
      elements.voiceStatusSubtext.textContent = 'Processing with OpenAI neural engine...';
      elements.voiceOrb.classList.add('thinking');
      state.voice.isListening = false;
      state.voice.isSpeaking = false;
      break;

    case 'SPEAKING':
      elements.voiceStatusHeading.textContent = 'Bunny is speaking...';
      elements.voiceStatusSubtext.textContent = 'Playing spoken voice response.';
      elements.voiceOrb.classList.add('speaking');
      elements.voiceVisualizer.classList.add('active');
      state.voice.isListening = false;
      state.voice.isSpeaking = true;
      break;
  }
}

async function toggleVoiceAction() {
  if (state.voice.isSpeaking) {
    stopVoiceAudio();
    setVoiceState('IDLE');
    return;
  }

  if (state.voice.isListening) {
    stopVoiceRecording();
    return;
  }

  startVoiceRecording();
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.voice.mediaRecorder = new MediaRecorder(stream);
    state.voice.audioChunks = [];

    state.voice.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.voice.audioChunks.push(e.data);
    };

    state.voice.mediaRecorder.onstop = async () => {
      // Clean up mic streams
      stream.getTracks().forEach(t => t.stop());

      const audioBlob = new Blob(state.voice.audioChunks, { type: 'audio/webm' });
      await processRecordedAudio(audioBlob);
    };

    state.voice.mediaRecorder.start();
    setVoiceState('LISTENING');

  } catch (err) {
    console.warn('[Bunny AI] Microphone access error:', err);
    if (err.name === 'NotAllowedError') {
      showVoiceAlert('Microphone permission denied. Please allow microphone access in your browser settings.');
    } else {
      // Fallback to browser Web Speech API
      startBrowserSpeechRecognition();
    }
  }
}

function stopVoiceRecording() {
  if (state.voice.mediaRecorder && state.voice.mediaRecorder.state !== 'inactive') {
    state.voice.mediaRecorder.stop();
  }
  if (state.voice.speechRecognition) {
    state.voice.speechRecognition.stop();
  }
}

async function processRecordedAudio(audioBlob) {
  setVoiceState('THINKING');

  // Convert audio blob to base64
  const reader = new FileReader();
  reader.readAsDataURL(audioBlob);
  reader.onloadend = async () => {
    const base64Audio = reader.result;

    try {
      // Send to OpenAI Whisper STT backend
      const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(state.customApiKey ? { 'x-api-key': state.customApiKey } : {})
        },
        body: JSON.stringify({ audio: base64Audio, format: 'webm' })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const transcribedText = data.text ? data.text.trim() : '';

      if (!transcribedText) {
        showVoiceAlert('Could not detect any speech. Please try again.');
        setVoiceState('IDLE');
        return;
      }

      // Show transcript preview
      elements.voiceTranscriptBox.classList.remove('hidden');
      elements.voiceTranscriptText.textContent = `"${transcribedText}"`;

      // Send to Chat & Spoken pipeline
      await handleVoiceQuery(transcribedText);

    } catch (err) {
      console.warn('[Bunny AI] Whisper transcription error:', err);
      // Fallback to text prompt
      showVoiceAlert(`Transcription error: ${err.message}. Switching to text fallback.`);
      setVoiceState('IDLE');
    }
  };
}

function startBrowserSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showVoiceAlert('Voice recognition is not supported in this browser. Please use text mode.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  recognition.onstart = () => {
    setVoiceState('LISTENING');
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    elements.voiceTranscriptBox.classList.remove('hidden');
    elements.voiceTranscriptText.textContent = `"${transcript}"`;
    await handleVoiceQuery(transcript);
  };

  recognition.onerror = (e) => {
    console.error('Speech recognition error:', e);
    showVoiceAlert(`Speech recognition error: ${e.error}`);
    setVoiceState('IDLE');
  };

  recognition.onend = () => {
    if (!state.voice.isSpeaking) setVoiceState('IDLE');
  };

  state.voice.speechRecognition = recognition;
  recognition.start();
}

async function handleVoiceQuery(queryText) {
  setVoiceState('THINKING');

  // Trigger standard send message flow
  await handleSendMessage(queryText);

  // Get the assistant's reply
  const lastMsg = state.conversation[state.conversation.length - 1];
  if (lastMsg && lastMsg.role === 'assistant' && !state.voice.isMuted) {
    await speakText(lastMsg.content);
  } else {
    setVoiceState('IDLE');
  }
}

async function speakText(text) {
  if (!text || state.voice.isMuted) return;
  state.voice.lastSpokenText = text;

  // Clean Markdown markers for natural speech
  const cleanedText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*#_~]/g, '')
    .trim()
    .slice(0, 1000); // Speak up to 1000 chars smoothly

  setVoiceState('SPEAKING');

  try {
    // Try OpenAI TTS backend
    const res = await fetch(`${API_BASE}/api/voice/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.customApiKey ? { 'x-api-key': state.customApiKey } : {})
      },
      body: JSON.stringify({ text: cleanedText, voice: 'nova' })
    });

    if (res.ok) {
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      stopVoiceAudio();

      const audio = new Audio(audioUrl);
      state.voice.currentAudio = audio;

      audio.onended = () => {
        setVoiceState('IDLE');
      };

      audio.onerror = () => {
        speakBrowserTTS(cleanedText);
      };

      await audio.play();
      return;
    }
  } catch (err) {
    console.warn('[Bunny AI] OpenAI TTS endpoint failed, using browser speech synthesis:', err);
  }

  // Fallback to browser SpeechSynthesis
  speakBrowserTTS(cleanedText);
}

function speakBrowserTTS(text) {
  if (!window.speechSynthesis) {
    setVoiceState('IDLE');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.05;

  utterance.onend = () => {
    setVoiceState('IDLE');
  };

  utterance.onerror = () => {
    setVoiceState('IDLE');
  };

  window.speechSynthesis.speak(utterance);
}

function stopVoiceAudio() {
  if (state.voice.currentAudio) {
    state.voice.currentAudio.pause();
    state.voice.currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  state.voice.isSpeaking = false;
}

function toggleVoiceMute() {
  state.voice.isMuted = !state.voice.isMuted;
  localStorage.setItem('bunny_voice_muted', state.voice.isMuted);
  if (state.voice.isMuted) {
    stopVoiceAudio();
    elements.btnVoiceMute.style.color = '#EF4444';
    showToast('Voice output muted', 'warning');
  } else {
    elements.btnVoiceMute.style.color = 'var(--text-secondary)';
    showToast('Voice output unmuted', 'success');
  }
}

function showVoiceAlert(msg) {
  elements.voiceAlert.classList.remove('hidden');
  elements.voiceAlertText.textContent = msg;
}

/* ==============================================================================
   MODEL VERIFICATION CONTROLLER
   ============================================================================== */
async function verifySelectedModel() {
  const modelToTest = elements.modalModelSelect.value;
  elements.btnVerifyModel.disabled = true;
  elements.btnVerifyModel.textContent = 'Verifying...';
  elements.modelVerifyFeedback.textContent = `Connecting to OpenAI to verify '${modelToTest}'...`;

  try {
    const res = await fetch(`${API_BASE}/api/model/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.customApiKey ? { 'x-api-key': state.customApiKey } : {})
      },
      body: JSON.stringify({ model: modelToTest })
    });

    const data = await res.json();

    if (data.verified) {
      elements.modelVerifyFeedback.innerHTML = `<span style="color: #10B981;">✅ Verified: ${data.message}</span>`;
      showToast(`Model ${modelToTest} verified successfully!`, 'success');
    } else if (data.status === 'model_unavailable_fallback_ready') {
      elements.modelVerifyFeedback.innerHTML = `<span style="color: #F59E0B;">⚠️ ${data.message} <br><strong>Fallback ready:</strong> ${data.hint}</span>`;
      showToast(data.hint, 'warning');
    } else {
      elements.modelVerifyFeedback.innerHTML = `<span style="color: var(--bunny-red);">${data.errorType || 'Error'}: ${data.message}</span>`;
      showToast(`Model verification failed: ${data.message}`, 'error');
    }
  } catch (err) {
    elements.modelVerifyFeedback.innerHTML = `<span style="color: var(--bunny-red);">Verification error: ${err.message}</span>`;
  } finally {
    elements.btnVerifyModel.disabled = false;
    elements.btnVerifyModel.textContent = 'Verify Access';
  }
}

/* ==============================================================================
   SETTINGS & EVENT BINDINGS
   ============================================================================== */
function loadSavedSettings() {
  elements.modelSelect.value = state.selectedModel;
  elements.modalModelSelect.value = state.selectedModel;
  updateModelBadges(state.selectedModel);

  elements.inputApiKey.value = state.customApiKey;
  elements.inputSystemPrompt.value = state.systemPrompt;
  elements.inputTemperature.value = state.temperature;
  elements.tempDisplay.textContent = state.temperature;
  elements.toggleStreaming.checked = state.isStreaming;

  if (state.supabaseUrl) elements.inputSupabaseUrl.value = state.supabaseUrl;
  if (state.supabaseAnonKey) elements.inputSupabaseAnonKey.value = state.supabaseAnonKey;

  updateStreamingBadge();
}

function updateStreamingBadge() {
  if (state.isStreaming) {
    elements.streamingBadge.classList.remove('hidden');
  } else {
    elements.streamingBadge.classList.add('hidden');
  }
}

function bindEvents() {
  // Navigation & Sidebar
  elements.btnToggleSidebar.addEventListener('click', toggleSidebar);
  elements.btnCloseSidebar.addEventListener('click', closeSidebar);
  elements.sidebarOverlay.addEventListener('click', closeSidebar);
  elements.btnNewChat.addEventListener('click', startNewChat);
  elements.btnClearAllHistory.addEventListener('click', clearAllConversations);
  elements.btnClearChat.addEventListener('click', startNewChat);

  // Brand Header Click triggers replay
  elements.brandHeaderIcon.addEventListener('click', replayStartupAnimation);

  // Model Dropdown
  elements.modelSelect.addEventListener('change', (e) => {
    state.selectedModel = e.target.value;
    localStorage.setItem('bunny_model', state.selectedModel);
    updateModelBadges(state.selectedModel);
    showToast(`Model switched to ${state.selectedModel}`, 'success');
  });

  elements.modalModelSelect.addEventListener('change', (e) => {
    state.selectedModel = e.target.value;
    localStorage.setItem('bunny_model', state.selectedModel);
    updateModelBadges(state.selectedModel);
  });

  // Verify Model Button
  elements.btnVerifyModel.addEventListener('click', verifySelectedModel);

  // Voice Assistant
  elements.btnOpenVoice.addEventListener('click', openVoiceModal);
  elements.btnMicInput.addEventListener('click', openVoiceModal);
  elements.btnCloseVoice.addEventListener('click', closeVoiceModal);
  elements.btnVoiceAction.addEventListener('click', toggleVoiceAction);
  elements.btnVoiceMute.addEventListener('click', toggleVoiceMute);
  elements.btnVoiceReplay.addEventListener('click', () => {
    if (state.voice.lastSpokenText) speakText(state.voice.lastSpokenText);
  });

  // Export Chat
  elements.btnExportChat.addEventListener('click', exportChatAsMarkdown);

  // Chat Form
  elements.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  elements.btnStop.addEventListener('click', stopGeneration);

  // Textarea Auto-Resize & Keyboard Shortcuts
  elements.chatInput.addEventListener('input', () => {
    elements.chatInput.style.height = 'auto';
    elements.chatInput.style.height = `${Math.min(elements.chatInput.scrollHeight, 160)}px`;
    updateCharCount();
  });

  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Prompt Suggestions
  elements.suggestionCards.forEach((card) => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) handleSendMessage(prompt);
    });
  });

  // Modals & Settings
  elements.btnApiKeyModal.addEventListener('click', openModal);
  elements.btnSupabaseStatus.addEventListener('click', openModal);
  elements.btnSettings.addEventListener('click', openModal);
  elements.btnCloseModal.addEventListener('click', closeModal);
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeModal();
  });
  elements.voiceModal.addEventListener('click', (e) => {
    if (e.target === elements.voiceModal) closeVoiceModal();
  });

  elements.btnToggleKeyVisibility.addEventListener('click', () => {
    const isPass = elements.inputApiKey.type === 'password';
    elements.inputApiKey.type = isPass ? 'text' : 'password';
  });

  elements.inputTemperature.addEventListener('input', (e) => {
    elements.tempDisplay.textContent = e.target.value;
  });

  elements.btnReplayStartup.addEventListener('click', replayStartupAnimation);

  elements.btnTestSupabase.addEventListener('click', async () => {
    try {
      elements.btnTestSupabase.textContent = 'Testing...';
      const res = await fetch(`${API_BASE}/api/supabase/status`);
      const data = await res.json();
      if (data.connected && data.tablesReady) {
        showToast('Supabase connection & tables verified!', 'success');
        updateSupabaseUIStatus(true, 'Connected to Supabase PostgreSQL');
      } else if (data.connected && !data.tablesReady) {
        showToast('Supabase connected, but tables not found. Run SQL migration.', 'warning');
        updateSupabaseUIStatus(false, data.message);
      } else {
        showToast(data.message || 'Supabase check failed', 'error');
        updateSupabaseUIStatus(false, data.message || 'Supabase offline');
      }
    } catch (err) {
      showToast('Could not reach backend to test Supabase', 'error');
    } finally {
      elements.btnTestSupabase.textContent = 'Test Supabase';
    }
  });

  elements.btnSaveSettings.addEventListener('click', saveSettings);

  // Global Keydown (Esc closes modal/sidebar, Ctrl+K / Ctrl+N for new chat)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeVoiceModal();
      closeSidebar();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'n')) {
      e.preventDefault();
      startNewChat();
    }
  });
}

function toggleSidebar() {
  elements.historySidebar.classList.toggle('open');
  elements.sidebarOverlay.classList.toggle('hidden');
}

function closeSidebar() {
  elements.historySidebar.classList.remove('open');
  elements.sidebarOverlay.classList.add('hidden');
}

function openModal() {
  elements.settingsModal.classList.remove('hidden');
}

function closeModal() {
  elements.settingsModal.classList.add('hidden');
}

function updateCharCount() {
  const count = elements.chatInput.value.length;
  elements.charCount.textContent = `${count.toLocaleString()} characters`;
}

function saveSettings() {
  const apiKey = elements.inputApiKey.value.trim();
  const systemPrompt = elements.inputSystemPrompt.value.trim();
  const temperature = parseFloat(elements.inputTemperature.value);
  const isStreaming = elements.toggleStreaming.checked;
  const model = elements.modalModelSelect.value;
  const supabaseUrl = elements.inputSupabaseUrl.value.trim();
  const supabaseAnonKey = elements.inputSupabaseAnonKey.value.trim();

  state.customApiKey = apiKey;
  state.systemPrompt = systemPrompt;
  state.temperature = temperature;
  state.isStreaming = isStreaming;
  state.selectedModel = model;

  localStorage.setItem('bunny_api_key', apiKey);
  localStorage.setItem('bunny_system_prompt', systemPrompt);
  localStorage.setItem('bunny_temperature', temperature);
  localStorage.setItem('bunny_streaming', isStreaming);
  localStorage.setItem('bunny_model', model);

  if (supabaseUrl) localStorage.setItem('supabase_url', supabaseUrl);
  if (supabaseAnonKey) localStorage.setItem('supabase_anon_key', supabaseAnonKey);

  updateModelBadges(model);
  updateStreamingBadge();

  if (supabaseUrl && supabaseAnonKey) {
    initSupabaseClient(supabaseUrl, supabaseAnonKey);
  }

  closeModal();
  showToast('Settings saved successfully', 'success');
}

function exportChatAsMarkdown() {
  if (state.conversation.length === 0) {
    showToast('No messages to export.', 'warning');
    return;
  }

  let md = `# Bunny AI Conversation Export\n`;
  md += `*Exported on ${new Date().toLocaleString()}*  \n`;
  md += `*Model: ${state.selectedModel}*\n\n---\n\n`;

  for (const msg of state.conversation) {
    const roleLabel = msg.role === 'user' ? '👤 **You**' : '🐰 **Bunny AI**';
    md += `### ${roleLabel}\n\n${msg.content}\n\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bunny-ai-chat-${Date.now()}.md`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Chat exported as Markdown', 'success');
}

/* ==============================================================================
   TOAST HELPER
   ============================================================================== */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : 'ℹ️'));
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
