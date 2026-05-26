// ─── OpenDrop Premium UI Controller ───
// Manages DOM interactions, glassmorphic views switching, P2P mesh 60 FPS 
// canvas renderer, drag-and-drop bindings, and transfer progress listings.

const OpenDropUI = (() => {
  const { state, subscribe, setUsername, getRecentRooms, saveCustomServer, clearCustomServer } = window.OpenDropState;
  const { genRoomCode, connectToRoom, setRoomLock, updateRoomRules, kickPeer, disconnectRoom } = window.OpenDropWebRTC;
  const { acceptIncomingFile, rejectIncomingFile, sendFiles } = window.OpenDropStream;
  const { esc, fmtSize, fmtTime, getFileType } = window.OpenDropUtils;

  // DOM Elements
  const els = {
    // Layouts
    entranceView: null,
    roomView: null,
    themeToggle: null,
    
    // Entrance
    usernameInput: null,
    roomInput: null,
    randomBtn: null,
    connectBtn: null,
    recentRoomsList: null,
    
    // Status & Header
    statusLabel: null,
    statusPulse: null,
    codeBadge: null,
    adminBadge: null,
    disconnectBtn: null,
    
    // Admin Controls
    adminCard: null,
    lockToggleBtn: null,
    fileRuleSelect: null,
    textRuleSelect: null,
    maxSizeInput: null,
    permToggleBtn: null,
    
    // Settings
    configToggle: null,
    configBody: null,
    cfgHost: null,
    cfgPort: null,
    cfgPath: null,
    cfgSecure: null,
    cfgSaveBtn: null,
    cfgResetBtn: null,
    
    // Drag & Drop
    dropzone: null,
    fileInput: null,
    
    // Tabs & Panes
    tabFilesBtn: null,
    tabTextBtn: null,
    paneFiles: null,
    paneText: null,
    textInputArea: null,
    sendTextBtn: null,
    pasteTextBtn: null,
    
    // Lists
    activityList: null,
    activityEmpty: null,
    activityClear: null,
    
    // Canvas Mesh
    meshCanvas: null,
    
    // Modal
    qrModal: null,
    qrModalClose: null,
    qrCanvasHolder: null,
    modalRoomLbl: null
  };

  // Canvas context & animation state
  let canvasCtx = null;
  let animationId = null;
  let nodes = [];
  let particles = [];

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem('od_premium_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleButton(savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('od_premium_theme', next);
    updateThemeToggleButton(next);
  }

  function updateThemeToggleButton(theme) {
    if (els.themeToggle) {
      els.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // ─── Bootstrap & Event Listeners ───
  function bootstrap() {
    // Cache all DOM references
    Object.keys(els).forEach(key => {
      const id = key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
      els[key] = document.getElementById(id);
    });

    initTheme();
    initDOMListeners();
    renderRecentRooms();

    // Populate username input
    if (els.usernameInput) {
      els.usernameInput.value = state.username;
    }

    // Populate room input
    if (els.roomInput) {
      els.roomInput.value = genRoomCode();
    }

    // Populate custom server settings if existing
    if (state.customServer) {
      els.cfgHost.value = state.customServer.host || '';
      els.cfgPort.value = state.customServer.port || '';
      els.cfgPath.value = state.customServer.path || '';
      els.cfgSecure.value = state.customServer.secure ? 'true' : 'false';
      if (els.configBody) els.configBody.classList.add('open');
    }

    // Subscribe to state changes
    subscribe('status_changed', handleStatusChanged);
    subscribe('room_joined', handleRoomJoined);
    subscribe('became_host', handleBecameHost);
    subscribe('admin_handoff', handleAdminHandoff);
    subscribe('rules_updated', handleRulesUpdated);
    subscribe('peers_updated', handlePeersUpdated);
    subscribe('room_reset', handleRoomReset);
    
    // Transfer events
    subscribe('outgoing_transfer_started', handleTransferStarted);
    subscribe('incoming_transfer_started', handleTransferStarted);
    subscribe('incoming_permission_requested', handlePermissionRequested);
    subscribe('transfer_progress', handleTransferProgress);
    subscribe('transfer_completed', handleTransferCompleted);
    subscribe('transfer_cancelled', handleTransferCancelled);
    subscribe('transfer_failed', handleTransferFailed);
    subscribe('text_received', handleTextReceived);
  }

  function initDOMListeners() {
    // Theme toggle
    if (els.themeToggle) els.themeToggle.onclick = toggleTheme;

    // Entrance controls
    if (els.randomBtn) els.randomBtn.onclick = () => { els.roomInput.value = genRoomCode(); };
    if (els.connectBtn) {
      els.connectBtn.onclick = () => {
        setUsername(els.usernameInput.value);
        connectToRoom(els.roomInput.value);
      };
    }

    // Disconnect
    if (els.disconnectBtn) els.disconnectBtn.onclick = disconnectRoom;

    // Admin toggle settings
    if (els.lockToggleBtn) {
      els.lockToggleBtn.onclick = () => {
        const next = !els.lockToggleBtn.classList.contains('active');
        setRoomLock(next);
      };
    }
    if (els.fileRuleSelect) {
      els.fileRuleSelect.onchange = () => {
        updateRoomRules({ canSendFiles: els.fileRuleSelect.value });
      };
    }
    if (els.textRuleSelect) {
      els.textRuleSelect.onchange = () => {
        updateRoomRules({ canSendText: els.textRuleSelect.value });
      };
    }
    if (els.maxSizeInput) {
      els.maxSizeInput.oninput = () => {
        const mb = parseFloat(els.maxSizeInput.value) || null;
        updateRoomRules({ maxFileSizeMB: mb });
      };
    }
    if (els.permToggleBtn) {
      els.permToggleBtn.onclick = () => {
        const next = !els.permToggleBtn.classList.contains('active');
        updateRoomRules({ requirePermission: next });
      };
    }

    // Config expandable toggle
    if (els.configToggle) {
      els.configToggle.onclick = () => {
        els.configBody.classList.toggle('open');
      };
    }

    if (els.cfgSaveBtn) {
      els.cfgSaveBtn.onclick = () => {
        saveCustomServer(els.cfgHost.value, els.cfgPort.value, els.cfgPath.value, els.cfgSecure.value);
        alert('Server configurations saved. Reconnect to apply.');
      };
    }

    if (els.cfgResetBtn) {
      els.cfgResetBtn.onclick = () => {
        clearCustomServer();
        els.cfgHost.value = '';
        els.cfgPort.value = '';
        els.cfgPath.value = '';
        els.cfgSecure.value = 'true';
        alert('Server configurations reset to default. Reconnect to apply.');
      };
    }

    // Drag and Drop
    if (els.dropzone) {
      els.dropzone.onclick = () => els.fileInput.click();
      
      els.dropzone.ondragover = (e) => {
        e.preventDefault();
        els.dropzone.classList.add('drag-over');
      };
      
      els.dropzone.ondragleave = () => {
        els.dropzone.classList.remove('drag-over');
      };
      
      els.dropzone.ondrop = (e) => {
        e.preventDefault();
        els.dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
          sendFiles(e.dataTransfer.files);
        }
      };
    }

    if (els.fileInput) {
      els.fileInput.onchange = () => {
        if (els.fileInput.files.length > 0) {
          sendFiles(els.fileInput.files);
          els.fileInput.value = ''; // Reset
        }
      };
    }

    // Tabs switching
    if (els.tabFilesBtn) {
      els.tabFilesBtn.onclick = () => {
        els.tabFilesBtn.classList.add('active');
        els.tabTextBtn.classList.remove('active');
        els.paneFiles.classList.add('active');
        els.paneText.classList.remove('active');
      };
    }

    if (els.tabTextBtn) {
      els.tabTextBtn.onclick = () => {
        els.tabTextBtn.classList.add('active');
        els.tabFilesBtn.classList.remove('active');
        els.paneText.classList.add('active');
        els.paneFiles.classList.remove('active');
      };
    }

    // Clipboard and Text Send
    if (els.sendTextBtn) {
      els.sendTextBtn.onclick = () => {
        const val = els.textInputArea.value.trim();
        if (val) {
          window.OpenDropWebRTC.broadcastMessage({ type: 'text', content: val });
          handleTextSent(val);
          els.textInputArea.value = '';
        }
      };
    }

    if (els.pasteTextBtn) {
      els.pasteTextBtn.onclick = async () => {
        try {
          const txt = await navigator.clipboard.readText();
          els.textInputArea.value = txt;
        } catch (e) {
          alert('Clipboard permission denied.');
        }
      };
    }

    // Clear logs
    if (els.activityClear) {
      els.activityClear.onclick = () => {
        els.activityList.innerHTML = '';
        els.activityEmpty.style.display = 'block';
      };
    }

    // QR Code
    if (els.codeBadge) {
      els.codeBadge.onclick = () => {
        openQRModal();
      };
    }

    if (els.qrModalClose) els.qrModalClose.onclick = closeQRModal;
    if (els.qrModal) els.qrModal.onclick = closeQRModal;
  }

  // Render recent room history
  function renderRecentRooms() {
    if (!els.recentRoomsList) return;
    els.recentRoomsList.innerHTML = '';
    
    const rooms = getRecentRooms();
    if (rooms.length === 0) {
      els.recentRoomsList.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted);">None yet</span>';
      return;
    }

    rooms.forEach(code => {
      const chip = document.createElement('div');
      chip.className = 'saved-room-chip';
      chip.textContent = code;
      chip.onclick = () => {
        if (els.roomInput) els.roomInput.value = code;
      };
      els.recentRoomsList.appendChild(chip);
    });
  }

  // ─── Reactive State Handlers ───
  function handleStatusChanged(data) {
    if (!els.statusLabel) return;
    
    // Sync status indicators
    els.statusLabel.textContent = data.msg;
    
    const pulse = els.statusPulse;
    if (pulse) {
      pulse.parentElement.className = `status-indicator ${data.status}`;
    }
  }

  function handleRoomJoined(data) {
    if (els.entranceView) els.entranceView.style.display = 'none';
    if (els.roomView) els.roomView.style.display = 'grid';
    
    if (els.codeBadge) els.codeBadge.textContent = data.code;
    
    // Initialize Canvas visualizer
    initMeshCanvas();
    
    // Toggle Admin Panel visibility
    handleBecameHost();
  }

  function handleBecameHost() {
    if (els.adminBadge) {
      els.adminBadge.style.display = state.isHost ? 'inline-block' : 'none';
    }
    if (els.adminCard) {
      els.adminCard.style.display = state.isHost ? 'flex' : 'none';
    }
  }

  function handleAdminHandoff(data) {
    handleBecameHost();
    const conn = state.connections.find(c => c.peer === data.newHostId);
    const hostLabel = conn ? conn.username : 'Peer Device';
    addSystemLog(`👑 Admin role passed to oldest member: <strong>${esc(hostLabel)}</strong>`);
  }

  function handleRulesUpdated(data) {
    // Update inputs to match current rule parameters
    if (els.lockToggleBtn) {
      if (data.locked) els.lockToggleBtn.classList.add('active');
      else els.lockToggleBtn.classList.remove('active');
    }
    if (els.fileRuleSelect) els.fileRuleSelect.value = data.rules.canSendFiles;
    if (els.textRuleSelect) els.textRuleSelect.value = data.rules.canSendText;
    if (els.maxSizeInput) els.maxSizeInput.value = data.rules.maxFileSizeMB || '';
    
    if (els.permToggleBtn) {
      if (data.rules.requirePermission) els.permToggleBtn.classList.add('active');
      else els.permToggleBtn.classList.remove('active');
    }
  }

  function handlePeersUpdated(list) {
    // Re-synchronize Canvas coordinates
    updateCanvasPeers(list);
  }

  function handleRoomReset() {
    // Halt canvas
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (els.entranceView) els.entranceView.style.display = 'flex';
    if (els.roomView) els.roomView.style.display = 'none';
    
    renderRecentRooms();
  }

  // ─── Transfer Cards Render Pipeline ───
  function getTransferCard(id) {
    return document.getElementById(`transfer-${id}`);
  }

  function handleTransferStarted(data) {
    if (els.activityEmpty) els.activityEmpty.style.display = 'none';
    
    const { id, name, size, senderName } = data;
    const direction = senderName ? 'incoming' : 'outgoing';
    const marker = direction === 'incoming' ? '📥' : '📤';
    const sub = direction === 'incoming' ? `From ${senderName}` : 'Broadcasting…';
    const ft = getFileType(name);

    const card = document.createElement('div');
    card.id = `transfer-${id}`;
    card.className = `transfer-card ${direction}`;

    card.innerHTML = `
      <div class="transfer-meta">
        <div class="transfer-info">
          <span class="transfer-icon" style="color:${ft.color}">${ft.icon}</span>
          <div class="transfer-title-block">
            <span class="transfer-title" title="${esc(name)}">${esc(name)}</span>
            <span class="transfer-subtitle">${esc(sub)}</span>
          </div>
        </div>
        <div class="transfer-actions" id="acts-${id}">
          <button class="btn destructive transfer-btn" onclick="OpenDropUI.cancelTransfer('${id}', '${direction}')">✕ Cancel</button>
        </div>
      </div>
      <div class="transfer-progress-block">
        <div class="transfer-progress-track">
          <div class="transfer-progress-fill" id="fill-${id}"></div>
        </div>
        <div class="transfer-stats-bar">
          <span id="prog-${id}">0% · 0 B / ${fmtSize(size)}</span>
          <span class="transfer-speed" id="spd-${id}">0.0 Mbps</span>
        </div>
      </div>
    `;

    els.activityList.insertBefore(card, els.activityList.firstChild);
  }

  function handlePermissionRequested(details) {
    if (els.activityEmpty) els.activityEmpty.style.display = 'none';

    const { id, name, size, senderName } = details;
    const ft = getFileType(name);

    const card = document.createElement('div');
    card.id = `transfer-${id}`;
    card.className = 'transfer-card incoming permission';

    card.innerHTML = `
      <div class="transfer-meta">
        <div class="transfer-info">
          <span class="transfer-icon" style="color:${ft.color}">${ft.icon}</span>
          <div class="transfer-title-block">
            <span class="transfer-title" title="${esc(name)}">${esc(name)}</span>
            <span class="transfer-subtitle">Incoming from ${esc(senderName)} · ${fmtSize(size)}</span>
          </div>
        </div>
      </div>
      <div class="permission-card">
        <span class="permission-lbl">Approve direct-to-disk download?</span>
        <button class="btn accent permission-btn" onclick="OpenDropUI.approveFile('${id}')">✓ Accept</button>
        <button class="btn destructive permission-btn" onclick="OpenDropUI.rejectFile('${id}')">✕ Decline</button>
      </div>
    `;

    els.activityList.insertBefore(card, els.activityList.firstChild);
  }

  function handleTransferProgress(data) {
    const { id, direction, percentage, transferred, speedMbps, eta } = data;
    
    const fill = document.getElementById(`fill-${id}`);
    const prog = document.getElementById(`prog-${id}`);
    const spd = document.getElementById(`spd-${id}`);
    
    if (fill) fill.style.width = `${percentage}%`;
    if (prog) {
      const card = getTransferCard(id);
      const limitText = card ? card.querySelector('.transfer-title-block').nextElementSibling === null ? 'estimating…' : '' : '';
      prog.textContent = `${percentage}% · ${fmtSize(transferred)} / ${prog.parentElement.parentElement.previousElementSibling ? '' : ''} · ETA ${fmtTime(eta)}`;
    }
    if (spd) spd.textContent = `${speedMbps} Mbps`;

    // Trigger visual connection flow on canvas
    triggerActiveCanvasFlow(direction === 'incoming');
  }

  function handleTransferCompleted(data) {
    const { id, name, size, direction } = data;
    const card = getTransferCard(id);
    if (!card) return;

    card.className = 'transfer-card completed';
    const fill = document.getElementById(`fill-${id}`);
    if (fill) {
      fill.style.width = '100%';
      fill.classList.add('success');
    }

    const spd = document.getElementById(`spd-${id}`);
    if (spd) spd.style.display = 'none';

    const prog = document.getElementById(`prog-${id}`);
    if (prog) prog.textContent = `Completed ✓ · ${fmtSize(size)}`;

    const acts = document.getElementById(`acts-${id}`);
    if (acts) acts.innerHTML = `<span style="font-size:0.75rem;color:var(--success);font-weight:600;">✓ Success</span>`;

    // Notification
    if (Notification.permission === 'granted') {
      new Notification('OpenDrop', {
        body: `${name} (${fmtSize(size)}) ${direction === 'incoming' ? 'received' : 'sent'} successfully!`,
        icon: 'assets/favicon.svg'
      });
    }
  }

  function handleTransferCancelled(data) {
    const { id } = data;
    const card = getTransferCard(id);
    if (!card) return;

    card.className = 'transfer-card cancelled';
    const fill = document.getElementById(`fill-${id}`);
    if (fill) {
      fill.style.width = '0%';
    }

    const prog = document.getElementById(`prog-${id}`);
    if (prog) prog.textContent = 'Transfer cancelled.';

    const spd = document.getElementById(`spd-${id}`);
    if (spd) spd.style.display = 'none';

    const acts = document.getElementById(`acts-${id}`);
    if (acts) acts.innerHTML = `<span style="font-size:0.75rem;color:var(--text-muted);">Cancelled</span>`;
  }

  function handleTransferFailed(data) {
    const { id, error } = data;
    const card = getTransferCard(id);
    if (!card) return;

    card.className = 'transfer-card failed';
    const fill = document.getElementById(`fill-${id}`);
    if (fill) fill.style.width = '0%';

    const prog = document.getElementById(`prog-${id}`);
    if (prog) prog.textContent = `Error: ${error || 'Transfer failed'}`;

    const spd = document.getElementById(`spd-${id}`);
    if (spd) spd.style.display = 'none';

    const acts = document.getElementById(`acts-${id}`);
    if (acts) acts.innerHTML = `<span style="font-size:0.75rem;color:var(--destructive);font-weight:600;">Failed</span>`;
  }

  // ─── Text Sharing log renderer ───
  function handleTextReceived(data) {
    if (els.activityEmpty) els.activityEmpty.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'transfer-card text-message incoming';
    card.innerHTML = `
      <div class="transfer-meta" style="margin-bottom:0.5rem;">
        <div class="transfer-info">
          <span class="transfer-icon" style="color:var(--accent-secondary)">📋</span>
          <div class="transfer-title-block">
            <span class="transfer-title">Clipboard shared from ${esc(data.sender)}</span>
          </div>
        </div>
        <button class="btn transfer-btn" onclick="OpenDropUI.copyText(this, \`${esc(data.content)}\`)">Copy</button>
      </div>
      <div class="text-message-bubble">${esc(data.content)}</div>
    `;

    els.activityList.insertBefore(card, els.activityList.firstChild);
  }

  function handleTextSent(content) {
    if (els.activityEmpty) els.activityEmpty.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'transfer-card text-message outgoing';
    card.innerHTML = `
      <div class="transfer-meta" style="margin-bottom:0.5rem;">
        <div class="transfer-info">
          <span class="transfer-icon" style="color:var(--accent-primary)">📋</span>
          <div class="transfer-title-block">
            <span class="transfer-title">Clipboard shared by You</span>
          </div>
        </div>
      </div>
      <div class="text-message-bubble">${esc(content)}</div>
    `;

    els.activityList.insertBefore(card, els.activityList.firstChild);
  }

  function addSystemLog(htmlContent) {
    if (els.activityEmpty) els.activityEmpty.style.display = 'none';
    const card = document.createElement('div');
    card.className = 'transfer-card system';
    card.style.padding = '0.75rem 1rem';
    card.innerHTML = `<div style="font-size:0.8rem;color:var(--text-secondary);">${htmlContent}</div>`;
    els.activityList.insertBefore(card, els.activityList.firstChild);
  }

  // ─── Interactive Canvas Mesh Renderer (60 FPS) ───
  function initMeshCanvas() {
    const canvas = els.meshCanvas;
    if (!canvas) return;

    canvasCtx = canvas.getContext('2d');
    
    // Set dynamic viewport size
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initial position setup for local device node (Center)
    nodes = [{
      id: state.myPeerId,
      name: 'You',
      isMe: true,
      x: canvas.width / 2,
      y: canvas.height / 2,
      targetX: canvas.width / 2,
      targetY: canvas.height / 2,
      radius: 26,
      angle: 0
    }];

    particles = [];
    
    // Start drawing loop
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(drawCanvasFrame);
  }

  function updateCanvasPeers(connections) {
    if (!els.meshCanvas || nodes.length === 0) return;

    const meNode = nodes[0];
    const peerNodes = connections.map((c, idx) => {
      // Circle radius coordinates calculations
      const count = connections.length;
      const radius = 64;
      const angle = (idx * 2 * Math.PI) / count;
      
      const x = els.meshCanvas.width / 2 + radius * Math.cos(angle);
      const y = els.meshCanvas.height / 2 + radius * Math.sin(angle);

      // Check if node already coordinates to animate position transitions
      const existing = nodes.find(n => n.id === c.peer);
      return {
        id: c.peer,
        name: c.username,
        isMe: false,
        x: existing ? existing.x : els.meshCanvas.width / 2,
        y: existing ? existing.y : els.meshCanvas.height / 2,
        targetX: x,
        targetY: y,
        radius: 20,
        angle
      };
    });

    nodes = [meNode, ...peerNodes];
  }

  function triggerActiveCanvasFlow(incoming) {
    if (nodes.length <= 1) return;
    
    // Add particle
    const fromIdx = incoming ? Math.floor(1 + Math.random() * (nodes.length - 1)) : 0;
    const toIdx = incoming ? 0 : Math.floor(1 + Math.random() * (nodes.length - 1));

    const fromNode = nodes[fromIdx];
    const toNode = nodes[toIdx];

    if (fromNode && toNode) {
      particles.push({
        from: fromNode,
        to: toNode,
        pct: 0,
        speed: 0.02 + Math.random() * 0.01
      });
    }
  }

  function drawCanvasFrame() {
    const canvas = els.meshCanvas;
    if (!canvas || !canvasCtx) return;

    const ctx = canvasCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // Ease nodes towards targets
    nodes.forEach(node => {
      if (node.isMe) {
        node.targetX = canvas.width / 2;
        node.targetY = canvas.height / 2;
      }
      node.x += (node.targetX - node.x) * 0.1;
      node.y += (node.targetY - node.y) * 0.1;
    });

    // 1. Draw Mesh Connections
    if (nodes.length > 1) {
      ctx.lineWidth = 1.5;
      nodes.forEach((n1, idx1) => {
        nodes.forEach((n2, idx2) => {
          if (idx1 < idx2) {
            // Draw connection line
            const grad = ctx.createLinearGradient(n1.x, n1.y, n2.x, n2.y);
            grad.addColorStop(0, n1.isMe ? 'rgba(200, 241, 53, 0.4)' : 'rgba(74, 222, 128, 0.3)');
            grad.addColorStop(1, n2.isMe ? 'rgba(200, 241, 53, 0.4)' : 'rgba(74, 222, 128, 0.3)');
            ctx.strokeStyle = grad;
            
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        });
      });
    }

    // 2. Draw flowing particles
    particles = particles.filter(p => {
      p.pct += p.speed;
      if (p.pct >= 1) return false;

      const px = p.from.x + (p.to.x - p.from.x) * p.pct;
      const py = p.from.y + (p.to.y - p.from.y) * p.pct;

      // Draw particle glow
      ctx.fillStyle = '#c8f135';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#c8f135';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Reset shadows
      ctx.shadowBlur = 0;
      return true;
    });

    // 3. Draw Device Nodes
    nodes.forEach(node => {
      // Glow rings
      ctx.shadowBlur = node.isMe ? 12 : 6;
      ctx.shadowColor = node.isMe ? '#c8f135' : '#4ade80';
      
      // Node background
      const radGrad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, node.radius);
      if (node.isMe) {
        radGrad.addColorStop(0, 'rgba(200, 241, 53, 0.2)');
        radGrad.addColorStop(1, 'rgba(200, 241, 53, 0.8)');
      } else {
        radGrad.addColorStop(0, 'rgba(74, 222, 128, 0.2)');
        radGrad.addColorStop(1, 'rgba(74, 222, 128, 0.7)');
      }
      
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      ctx.fill();
      
      // Node border
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
      ctx.stroke();

      // Node label
      ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
      ctx.font = 'bold 9px var(--font-title)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Truncate name
      let label = node.name;
      if (label.length > 8) label = label.slice(0, 7) + '…';
      
      ctx.fillText(label, node.x, node.y + (node.isMe ? 0 : 0));

      // Draw Star icon if node is Room Admin Host
      const nodeSlot = OpenDropWebRTC.getSlotFromPeerId(node.id);
      if (nodeSlot === '' && nodes.length > 1) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px sans-serif';
        ctx.fillText('👑', node.x, node.y - node.radius - 8);
      }
    });

    animationId = requestAnimationFrame(drawCanvasFrame);
  }

  // ─── Modal Actions ───
  function openQRModal() {
    if (!els.qrModal) return;
    
    // Generate QR Canvas
    if (els.qrCanvasHolder && state.roomCode) {
      els.qrCanvasHolder.innerHTML = '';
      const shareUrl = `${window.location.origin}/app.html?room=${encodeURIComponent(state.roomCode)}`;
      new QRCode(els.qrCanvasHolder, {
        text: shareUrl,
        width: 180,
        height: 180,
        colorDark: '#0b0b0c',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    if (els.modalRoomLbl) {
      els.modalRoomLbl.textContent = state.roomCode || '—';
    }

    els.qrModal.classList.add('open');
  }

  function closeQRModal() {
    if (els.qrModal) els.qrModal.classList.remove('open');
  }

  // ─── Public Actions called by inline events ───
  function cancelTransfer(id, direction) {
    if (direction === 'incoming') {
      OpenDropStream.cancelIncoming(id);
    } else {
      OpenDropStream.cancelOutgoing(id);
    }
  }

  function approveFile(id) {
    // Remove permission card from UI card list dynamically
    const card = getTransferCard(id);
    if (card) card.remove();
    acceptIncomingFile(id);
  }

  function rejectFile(id) {
    const card = getTransferCard(id);
    if (card) card.remove();
    rejectIncomingFile(id);
  }

  function copyText(btn, content) {
    navigator.clipboard.writeText(content).then(() => {
      const origText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('accent');
      setTimeout(() => {
        btn.textContent = origText;
        btn.classList.remove('accent');
      }, 2000);
    });
  }

  return {
    bootstrap,
    cancelTransfer,
    approveFile,
    rejectFile,
    copyText
  };
})();

// Attach globally
window.OpenDropUI = OpenDropUI;
