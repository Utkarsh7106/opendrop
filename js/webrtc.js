// ─── OpenDrop Premium WebRTC Mesh Engine ───
// Manages PeerJS instantiation, full mesh connectivity, ICE STUN configurations, 
// room lock checking, and admin handoff.

const OpenDropWebRTC = (() => {
  const { SLOTS } = window.OpenDropConfig;
  const { state, emit, saveRoomToHistory, getPeerConfig } = window.OpenDropState;
  const { uid, sleep } = window.OpenDropUtils;

  let peer = null;

  // ─── Room Code Generation (Adjective-Noun-Number) ───
  function genRoomCode() {
    const adjs = ['swift', 'calm', 'bright', 'golden', 'quiet', 'keen', 'bold', 'wise', 'dark', 'rapid', 'clear', 'iron', 'brave', 'cool', 'wild', 'cosmic', 'aurora', 'hyper'];
    const nouns = ['lion', 'wave', 'pine', 'cloud', 'star', 'hawk', 'river', 'oak', 'moon', 'fox', 'wolf', 'stone', 'bear', 'flame', 'peak', 'falcon', 'nebula', 'glacier'];
    const num = Math.floor(Math.random() * 900) + 100;
    
    const adj = adjs[Math.floor(Math.random() * adjs.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    
    return `${adj}-${noun}-${num}`;
  }

  // Convert a room code and slot index into a stable PeerJS ID
  function roomToPeerId(code, slot) {
    const safeCode = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `od-prem-${safeCode}${slot ? '-' + slot : ''}`;
  }

  // Get slot label from a peer ID
  function getSlotFromPeerId(peerId) {
    const parts = peerId.split('-');
    const last = parts[parts.length - 1];
    return SLOTS.includes(last) ? last : '';
  }

  // ─── Connect & Join Room ───
  function connectToRoom(code) {
    const cleanCode = code.trim().toLowerCase();
    if (!cleanCode) return;

    // Gracefully clean up any active peer connection before starting a new one
    disconnectRoom();

    state.roomCode = cleanCode;
    emit('status_changed', { status: 'connecting', msg: `Joining room "${cleanCode}"…` });

    // Begin scanning slots sequentially from index 0
    trySlot(cleanCode, 0);
  }

  // Scan slot availability
  function trySlot(code, slotIdx) {
    if (slotIdx >= SLOTS.length) {
      emit('status_changed', { status: 'error', msg: 'Room is full (Max 15 devices allowed)' });
      return;
    }

    const targetPeerId = roomToPeerId(code, SLOTS[slotIdx]);
    const peerCfg = getPeerConfig();

    // Create the PeerJS client
    const p = new Peer(targetPeerId, peerCfg);

    p.on('open', id => {
      peer = p;
      state.myPeerId = id;
      state.isHost = SLOTS[slotIdx] === '';
      
      if (state.isHost) {
        state.hostPeerId = id;
        state.roomRules.requirePermission = true; // reset to default
      }
      
      onRoomJoined(code, id, slotIdx);
    });

    p.on('connection', c => {
      setupConnection(c);
    });

    p.on('error', err => {
      if (err.type === 'unavailable-id') {
        // Slot is already occupied. Close and scan next slot.
        p.destroy();
        trySlot(code, slotIdx + 1);
      } else if (err.type === 'peer-unavailable') {
        // Normal during peer probing; swallow this
      } else {
        console.error('PeerJS error encountered', err);
        emit('status_changed', { status: 'error', msg: `Connection error: ${err.type}` });
      }
    });
  }

  // Handle successful join
  function onRoomJoined(code, myId, slotIdx) {
    saveRoomToHistory(code);
    emit('status_changed', { 
      status: 'connected', 
      msg: `Connected to room "${code}" as ${state.username}` 
    });

    emit('room_joined', { code, myId, isHost: state.isHost });

    // If we are host, initialize room rules and lock status
    if (state.isHost) {
      state.roomLocked = false;
      broadcastMessage({ type: 'rules-sync', rules: state.roomRules, locked: state.roomLocked });
    }

    // Connect to all other possible slots to form the P2P Mesh
    SLOTS.forEach((slot, i) => {
      if (i !== slotIdx) {
        const potentialPeerId = roomToPeerId(code, slot);
        initiateMeshConnection(potentialPeerId);
      }
    });
  }

  // Initiate direct connection to other potential slots
  function initiateMeshConnection(targetPeerId) {
    if (!peer) return;
    try {
      const c = peer.connect(targetPeerId, {
        reliable: true,
        serialization: 'binary', // Default peerjs messages
        metadata: { username: state.username }
      });
      if (c) setupConnection(c);
    } catch (e) {
      console.warn(`Mesh initiate to ${targetPeerId} skipped`, e);
    }
  }

  // ─── Connection Orchestrator ───
  function setupConnection(c) {
    c.on('open', () => {
      // Check duplicate connections
      if (state.connections.find(conn => conn.peer === c.peer)) {
        c.close();
        return;
      }

      // Check if room is locked (Host rejects uninvited joiners)
      if (state.isHost && state.roomLocked) {
        try {
          c.send({ type: 'rejected', reason: 'Room is locked by the admin' });
        } catch(e) {}
        setTimeout(() => c.close(), 300);
        return;
      }

      // Explicitly set binaryType to 'arraybuffer' on the RTCDataChannel for high-performance direct chunks
      if (c.dataChannel) {
        c.dataChannel.binaryType = 'arraybuffer';
        
        // Intercept incoming raw binary chunks bypassing PeerJS packing
        c.dataChannel.addEventListener('message', (event) => {
          if (event.data instanceof ArrayBuffer) {
            // Stop propagation so PeerJS doesn't try to parse it as serialized packet
            event.stopImmediatePropagation();
            
            // Hand off to raw streaming manager
            if (window.OpenDropStream) {
              window.OpenDropStream.handleIncomingChunk(event.data, c.peer);
            }
          }
        });
      }

      // Read remote user details from metadata
      c.username = c.metadata?.username || `Device-${c.peer.split('-').pop() || 'Peer'}`;
      state.connections.push(c);

      // Determine who the host is (lowest alphabetical slot index)
      determineHostId();

      // Trigger mesh updates
      emit('peers_updated', state.connections);
      emit('status_changed', { 
        status: 'connected', 
        msg: `${state.connections.length} device(s) connected in room "${state.roomCode}"` 
      });

      // Synchronize rules to the newly joined peer if we are host
      if (state.isHost) {
        try {
          c.send({ 
            type: 'rules-sync', 
            rules: state.roomRules, 
            locked: state.roomLocked,
            hostPeerId: state.myPeerId 
          });
        } catch (e) {}
      }
    });

    c.on('data', data => {
      handleIncomingMessage(data, c);
    });

    c.on('close', () => {
      const closingPeerId = c.peer;
      state.connections = state.connections.filter(conn => conn.peer !== closingPeerId);

      // Clean up outstanding binary transfers for this peer
      if (window.OpenDropStream) {
        window.OpenDropStream.cleanupPeerTransfers(closingPeerId);
      }

      // If the host disconnected, execute oldest member election
      const wasHost = closingPeerId === state.hostPeerId;
      determineHostId();

      if (wasHost && state.hostPeerId === state.myPeerId) {
        state.isHost = true;
        emit('became_host');
        // Broadcast new admin rights to everyone
        broadcastMessage({ 
          type: 'admin-handoff', 
          newHostId: state.myPeerId, 
          rules: state.roomRules,
          locked: state.roomLocked 
        });
      }

      emit('peers_updated', state.connections);
      
      const count = state.connections.length;
      emit('status_changed', { 
        status: count > 0 ? 'connected' : 'connecting', 
        msg: count > 0 ? `${count} device(s) connected` : 'Waiting for other devices to join…' 
      });
    });

    c.on('error', err => {
      console.warn(`Connection error on peer ${c.peer}`, err);
    });
  }

  // ─── Messaging & Rules ───
  function handleIncomingMessage(data, conn) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'rejected':
        emit('status_changed', { status: 'error', msg: `Connection rejected: ${data.reason}` });
        disconnectRoom();
        break;

      case 'rules-sync':
        state.roomRules = Object.assign(state.roomRules, data.rules);
        state.roomLocked = !!data.locked;
        if (data.hostPeerId) state.hostPeerId = data.hostPeerId;
        emit('rules_updated', { rules: state.roomRules, locked: state.roomLocked });
        break;

      case 'admin-handoff':
        state.hostPeerId = data.newHostId;
        state.roomRules = Object.assign(state.roomRules, data.rules);
        state.roomLocked = !!data.locked;
        emit('admin_handoff', { newHostId: data.newHostId });
        emit('rules_updated', { rules: state.roomRules, locked: state.roomLocked });
        break;

      case 'text':
        if (state.roomRules.canSendText === 'none') return;
        if (state.roomRules.canSendText === 'host' && conn.peer !== state.hostPeerId) return;
        emit('text_received', { sender: conn.username, content: data.content, senderId: conn.peer });
        break;

      case 'kick':
        if (conn.peer === state.hostPeerId) {
          emit('status_changed', { status: 'error', msg: 'You have been removed from the room by the host' });
          disconnectRoom();
        }
        break;

      default:
        // Pass unhandled signals (file-meta, cancel, etc.) to the binary transfer pipeline
        if (window.OpenDropStream) {
          window.OpenDropStream.handleSignal(data, conn.peer);
        }
        break;
    }
  }

  // Broadcast a PeerJS message to all active mesh peers
  function broadcastMessage(data) {
    state.connections.forEach(c => {
      try {
        if (c.open) c.send(data);
      } catch (e) {
        console.warn(`Failed to broadcast to ${c.peer}`, e);
      }
    });
  }

  // Determine host ID based on lowest alphabetical slot index in the room (oldest peer)
  function determineHostId() {
    if (!state.myPeerId) return;
    
    const allPeers = [state.myPeerId, ...state.connections.map(c => c.peer)];
    
    // Sort based on slot indexes in SLOTS
    allPeers.sort((a, b) => {
      const slotA = getSlotFromPeerId(a);
      const slotB = getSlotFromPeerId(b);
      return SLOTS.indexOf(slotA) - SLOTS.indexOf(slotB);
    });

    state.hostPeerId = allPeers[0];
    state.isHost = state.hostPeerId === state.myPeerId;
  }

  // ─── Admin Toggles ───
  function setRoomLock(locked) {
    if (!state.isHost) return;
    state.roomLocked = !!locked;
    broadcastMessage({ type: 'rules-sync', rules: state.roomRules, locked: state.roomLocked });
    emit('rules_updated', { rules: state.roomRules, locked: state.roomLocked });
  }

  function updateRoomRules(newRules) {
    if (!state.isHost) return;
    state.roomRules = Object.assign(state.roomRules, newRules);
    broadcastMessage({ type: 'rules-sync', rules: state.roomRules, locked: state.roomLocked });
    emit('rules_updated', { rules: state.roomRules, locked: state.roomLocked });
  }

  function kickPeer(peerId) {
    if (!state.isHost) return;
    const conn = state.connections.find(c => c.peer === peerId);
    if (conn) {
      try { conn.send({ type: 'kick' }); } catch(e) {}
      setTimeout(() => conn.close(), 200);
    }
  }

  // ─── Disconnect ───
  function disconnectRoom() {
    if (peer) {
      peer.destroy();
      peer = null;
    }
    OpenDropState.resetRoomState();
    emit('status_changed', { status: 'disconnected', msg: 'Enter a room code and connect' });
  }

  return {
    genRoomCode,
    connectToRoom,
    broadcastMessage,
    setRoomLock,
    updateRoomRules,
    kickPeer,
    disconnectRoom,
    roomToPeerId,
    getSlotFromPeerId
  };
})();

// Attach globally
window.OpenDropWebRTC = OpenDropWebRTC;
