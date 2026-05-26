// ─── OpenDrop Premium Utilities ───
// Self-contained utility module. Used across the entire application.

const OpenDropUtils = (() => {
  // Generate a cryptographically secure-ish random string ID
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  // Format file bytes beautifully
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(2) + ' MB';
    return (b / 1024 ** 3).toFixed(2) + ' GB';
  }

  // Format seconds into readable duration
  function fmtTime(s) {
    if (isNaN(s) || !isFinite(s) || s < 0) return 'estimating…';
    if (s < 60) return Math.round(s) + 's';
    if (s < 3600) return Math.round(s / 60) + 'm ' + Math.round(s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm';
  }

  // Escape HTML characters to prevent XSS injection
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Create an HTML element with class and optional text content
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Asynchronous ticks
  function tick() {
    return new Promise(r => setTimeout(r, 0));
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Deduce file type and return specific color and icon markers
  function getFileType(filename, mime) {
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    
    if (/^(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(ext) || (mime && mime.startsWith('image/'))) {
      return { type: 'image', color: '#2dd4bf', icon: '🖼️' };
    }
    if (/^(mp4|webm|mov|mkv|avi|flv)$/i.test(ext) || (mime && mime.startsWith('video/'))) {
      return { type: 'video', color: '#6366f1', icon: '🎬' };
    }
    if (/^(mp3|wav|ogg|flac|aac|m4a)$/i.test(ext) || (mime && mime.startsWith('audio/'))) {
      return { type: 'audio', color: '#ec4899', icon: '🎵' };
    }
    if (/^(pdf|doc|docx|txt|rtf|odt|xls|xlsx|ppt|pptx|csv|md)$/i.test(ext)) {
      return { type: 'document', color: '#3b82f6', icon: '📄' };
    }
    if (/^(zip|rar|7z|tar|gz|bz2)$/i.test(ext)) {
      return { type: 'archive', color: '#f59e0b', icon: '📦' };
    }
    if (/^(js|ts|jsx|tsx|html|css|py|java|c|cpp|h|go|rs|php|rb|swift|kt|json|xml|yaml|sql|sh|bat)$/i.test(ext)) {
      return { type: 'code', color: '#10b981', icon: '💻' };
    }
    return { type: 'other', color: '#6b7280', icon: '📎' };
  }

  // Detect iOS platform details
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  // File System Access API support for direct streaming to disk
  function hasFSAPI() {
    return typeof window.showSaveFilePicker === 'function';
  }

  // TransformStream support for memory-conscious fallback piping
  function hasTransformStream() {
    return typeof TransformStream !== 'undefined';
  }

  return {
    uid,
    fmtSize,
    fmtTime,
    esc,
    el,
    tick,
    sleep,
    getFileType,
    isIOS,
    hasFSAPI,
    hasTransformStream
  };
})();

// Attach globally
window.OpenDropUtils = OpenDropUtils;
