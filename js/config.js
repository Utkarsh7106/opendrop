// ─── OpenDrop Premium Configuration ───
// Holds all global constants and PeerJS configuration parameters.

const OpenDropConfig = (() => {
  // Transfer specifications
  const CHUNK = 64 * 1024;                            // 64 KB binary chunks (Sweet spot for WebRTC speed & safety)
  const MAX_BYTES = 50 * 1024 * 1024 * 1024;         // 50 GB max file size
  const SLOTS = ['', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o']; // Max 15 connected peers
  
  // Buffering and performance settings
  const BACKPRESSURE_LIMIT = 4 * 1024 * 1024;         // 4 MB buffer threshold to throttle chunk pipeline
  const SPEED_UPDATE_INTERVAL = 250;                 // speed update frequency (ms)
  const LARGE_FILE_WARNING = 150 * 1024 * 1024;      // warn user above 150 MB files
  const MEMORY_FALLBACK_LIMIT = 300 * 1024 * 1024;   // warn above 300 MB on memory-only browsers
  const ROOM_HISTORY_LIMIT = 5;
  const BASE_URL = window.location.origin;           // Auto-resolution of deep links
  
  // WebRTC STUN/TURN servers to bypass closed routers & firewalls
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];

  // Default PeerJS Connection Server configuration
  const DEFAULT_PEER_CONFIG = {
    host: 'opendrop-peer-production.up.railway.app',
    port: 443,
    path: '/',
    secure: true,
    debug: 0,
    config: {
      iceServers: ICE_SERVERS
    }
  };

  // Default room sharing permissions
  const DEFAULT_RULES = {
    canSendFiles: 'all',       // 'all' | 'host' | 'none'
    canSendText: 'all',        // 'all' | 'host' | 'none'
    maxFileSizeMB: null,       // null = no limit | number
    requirePermission: true    // require recipient approval before downloading
  };

  return {
    CHUNK,
    MAX_BYTES,
    SLOTS,
    BACKPRESSURE_LIMIT,
    SPEED_UPDATE_INTERVAL,
    LARGE_FILE_WARNING,
    MEMORY_FALLBACK_LIMIT,
    ROOM_HISTORY_LIMIT,
    BASE_URL,
    ICE_SERVERS,
    DEFAULT_PEER_CONFIG,
    DEFAULT_RULES
  };
})();

// Attach globally
window.OpenDropConfig = OpenDropConfig;
