// ─── OpenDrop Premium State Management ───
// Manages application state, persistent local storage, and reactive hooks.

const OpenDropState = (() => {
  const { DEFAULT_RULES, DEFAULT_PEER_CONFIG, ROOM_HISTORY_LIMIT } = window.OpenDropConfig;

  // ─── Private Persistent Storage Keys ───
  const KEYS = {
    USERNAME: 'od_premium_username',
    RECENT_ROOMS: 'od_premium_recent_rooms',
    CUSTOM_SERVER: 'od_premium_custom_server'
  };

  // ─── Reactive Application Core State ───
  const state = {
    // Client info
    username: localStorage.getItem(KEYS.USERNAME) || `User-${Math.floor(100 + Math.random() * 900)}`,
    
    // Active Room status
    roomCode: '',
    myPeerId: '',
    isHost: false,
    hostPeerId: '',
    roomLocked: false,
    roomRules: Object.assign({}, DEFAULT_RULES),
    
    // WebRTC connections array (active peers)
    connections: [],
    
    // Settings configuration
    customServer: null
  };

  // Load custom server from memory if saved
  try {
    const rawCustom = localStorage.getItem(KEYS.CUSTOM_SERVER);
    if (rawCustom) {
      state.customServer = JSON.parse(rawCustom);
    }
  } catch (e) {
    console.error('Failed to parse custom server settings', e);
  }

  // ─── Event Listener Subscriptions ───
  const listeners = {};

  function subscribe(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function emit(event, data) {
    if (listeners[event]) {
      listeners[event].forEach(fn => {
        try { fn(data); } catch (e) { console.error('State event crash', e); }
      });
    }
  }

  // ─── User Profile Actions ───
  function setUsername(name) {
    const cleanName = name.trim().slice(0, 20);
    if (cleanName) {
      state.username = cleanName;
      localStorage.setItem(KEYS.USERNAME, cleanName);
      emit('username_changed', cleanName);
    }
  }

  // ─── Rooms History Actions ───
  function getRecentRooms() {
    try {
      const raw = localStorage.getItem(KEYS.RECENT_ROOMS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRoomToHistory(code) {
    const clean = code.trim().toLowerCase();
    if (!clean) return;
    
    let list = getRecentRooms();
    list = list.filter(r => r !== clean);
    list.unshift(clean);
    
    if (list.length > ROOM_HISTORY_LIMIT) {
      list = list.slice(0, ROOM_HISTORY_LIMIT);
    }
    
    localStorage.setItem(KEYS.RECENT_ROOMS, JSON.stringify(list));
    emit('history_changed', list);
  }

  // ─── Custom Server Actions ───
  function saveCustomServer(host, port, path, secure) {
    const serverObj = {
      host: host.trim(),
      port: parseInt(port) || 443,
      path: path.trim() || '/',
      secure: secure === 'true' || secure === true
    };
    
    state.customServer = serverObj;
    localStorage.setItem(KEYS.CUSTOM_SERVER, JSON.stringify(serverObj));
    emit('custom_server_changed', serverObj);
  }

  function clearCustomServer() {
    state.customServer = null;
    localStorage.removeItem(KEYS.CUSTOM_SERVER);
    emit('custom_server_changed', null);
  }

  // Get current active PeerJS configuration (default or custom)
  function getPeerConfig() {
    if (state.customServer) {
      return Object.assign({}, DEFAULT_PEER_CONFIG, state.customServer);
    }
    return DEFAULT_PEER_CONFIG;
  }

  // ─── Room State Mutations ───
  function resetRoomState() {
    state.roomCode = '';
    state.myPeerId = '';
    state.isHost = false;
    state.hostPeerId = '';
    state.roomLocked = false;
    state.roomRules = Object.assign({}, DEFAULT_RULES);
    
    // Close connections gracefully
    state.connections.forEach(c => {
      try { c.close(); } catch(e) {}
    });
    state.connections = [];
    emit('room_reset');
  }

  return {
    state,
    subscribe,
    emit,
    setUsername,
    getRecentRooms,
    saveRoomToHistory,
    saveCustomServer,
    clearCustomServer,
    getPeerConfig,
    resetRoomState
  };
})();

// Attach globally
window.OpenDropState = OpenDropState;
