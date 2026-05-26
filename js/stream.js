// ─── OpenDrop Premium Binary Stream Engine ───
// Programmed to handle raw binary chunking over WebRTC DataChannels, custom 24-byte 
// headers, backpressure flow control, and direct-to-disk writing.

const OpenDropStream = (() => {
  const { CHUNK, BACKPRESSURE_LIMIT, SPEED_UPDATE_INTERVAL, MEMORY_FALLBACK_LIMIT } = window.OpenDropConfig;
  const { state, emit } = window.OpenDropState;
  const { uid, fmtSize, fmtTime, hasFSAPI, hasTransformStream, sleep } = window.OpenDropUtils;

  // Active transfers tracking lists
  const activeOutgoing = {};
  const activeIncoming = {};
  const pendingIncoming = {};

  // ─── Custom Binary Protocol (24-Byte Header) ───
  // Byte 0-15 (16 bytes): File ID (padded with \0)
  // Byte 16-19 (4 bytes): Chunk Index (Uint32, little-endian)
  // Byte 20-23 (4 bytes): Chunk Size (Uint32, little-endian)
  // Byte 24 onwards: Raw chunk payload

  function createHeaderedBuffer(fileId, chunkIdx, payload) {
    const idStr = fileId.padEnd(16, '\0');
    const headered = new ArrayBuffer(24 + payload.byteLength);
    const u8 = new Uint8Array(headered);

    // Write File ID (ASCII codes)
    for (let i = 0; i < 16; i++) {
      u8[i] = idStr.charCodeAt(i);
    }

    // Write Chunk Index & Size
    const view = new DataView(headered);
    view.setUint32(16, chunkIdx, true);
    view.setUint32(20, payload.byteLength, true);

    // Copy Payload
    u8.set(new Uint8Array(payload), 24);

    return headered;
  }

  function parseHeaderedBuffer(buffer) {
    if (buffer.byteLength < 24) return null;

    const u8 = new Uint8Array(buffer);

    // Parse File ID
    let fileId = '';
    for (let i = 0; i < 16; i++) {
      const code = u8[i];
      if (code !== 0) {
        fileId += String.fromCharCode(code);
      }
    }

    // Parse Index & Size
    const view = new DataView(buffer);
    const chunkIdx = view.getUint32(16, true);
    const chunkSize = view.getUint32(20, true);

    // Extract payload data channel slice
    const payload = buffer.slice(24);

    return { fileId, chunkIdx, chunkSize, payload };
  }

  // ─── Outgoing Transmit Pipeline (Send File) ───
  async function sendFiles(files) {
    if (state.connections.length === 0) {
      alert('No devices connected! Please connect another device first.');
      return;
    }

    // Check room sender-side sharing restrictions
    if (state.roomRules.canSendFiles === 'none') {
      alert('File sending is restricted in this room.');
      return;
    }
    if (state.roomRules.canSendFiles === 'host' && !state.isHost) {
      alert('Only the Host is allowed to send files in this room.');
      return;
    }

    for (const file of files) {
      // Validate room file size restrictions
      if (state.roomRules.maxFileSizeMB && file.size > state.roomRules.maxFileSizeMB * 1024 * 1024) {
        alert(`File "${file.name}" exceeds this room's maximum size of ${state.roomRules.maxFileSizeMB} MB.`);
        continue;
      }

      const fileId = uid();
      activeOutgoing[fileId] = {
        name: file.name,
        size: file.size,
        sentBytes: 0,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        bytesSinceSpeed: 0,
        cancelled: false
      };

      // Broadcast file metadata packet via PeerJS standard signaling
      OpenDropWebRTC.broadcastMessage({
        type: 'file-meta',
        id: fileId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream'
      });

      emit('outgoing_transfer_started', {
        id: fileId,
        name: file.name,
        size: file.size
      });

      // Begin slicing stream chunk loop
      (async () => {
        const transfer = activeOutgoing[fileId];
        let chunkIdx = 0;
        let offset = 0;

        try {
          while (offset < file.size) {
            if (transfer.cancelled) break;

            const slice = file.slice(offset, offset + CHUNK);
            const arrayBuf = await slice.arrayBuffer();

            if (transfer.cancelled) break;

            // ── Backpressure Check (Throttles memory overflows) ──
            for (const conn of state.connections) {
              const dc = conn.dataChannel;
              while (dc && dc.bufferedAmount > BACKPRESSURE_LIMIT) {
                await sleep(15);
                if (transfer.cancelled) break;
              }
            }

            if (transfer.cancelled) break;

            // Wrap in custom raw binary buffer header
            const headered = createHeaderedBuffer(fileId, chunkIdx, arrayBuf);

            // Send raw ArrayBuffer directly over RTCDataChannels
            state.connections.forEach(conn => {
              const dc = conn.dataChannel;
              if (dc && dc.readyState === 'open') {
                try {
                  dc.send(headered);
                } catch (e) {
                  console.error('Failed to send raw chunk', e);
                }
              }
            });

            offset += CHUNK;
            transfer.sentBytes += arrayBuf.byteLength;
            transfer.bytesSinceSpeed += arrayBuf.byteLength;
            chunkIdx++;

            // Periodically compute speed analytics
            const now = Date.now();
            if (now - transfer.lastUpdate > SPEED_UPDATE_INTERVAL) {
              const timeWindow = (now - transfer.lastUpdate) / 1000;
              const speedMBs = (transfer.bytesSinceSpeed / timeWindow) / (1024 * 1024);
              const elapsedSec = (now - transfer.startTime) / 1000;
              const avgSpeed = transfer.sentBytes / elapsedSec;
              const remaining = file.size - transfer.sentBytes;
              const etaSec = avgSpeed > 0 ? remaining / avgSpeed : 0;

              emit('transfer_progress', {
                id: fileId,
                direction: 'outgoing',
                percentage: Math.min(100, Math.round((transfer.sentBytes / file.size) * 100)),
                transferred: transfer.sentBytes,
                speedMbps: (speedMBs * 8).toFixed(1), // Show in Megabits per second
                eta: Math.round(etaSec)
              });

              transfer.bytesSinceSpeed = 0;
              transfer.lastUpdate = now;
            }

            // Yield briefly to keep browser UI active and responsive
            if (chunkIdx % 8 === 0) {
              await sleep(0);
            }
          }

          if (!transfer.cancelled) {
            emit('transfer_completed', {
              id: fileId,
              direction: 'outgoing',
              name: file.name,
              size: file.size
            });
          }
        } catch (e) {
          console.error('Outgoing file stream broke down', e);
          emit('transfer_failed', { id: fileId, direction: 'outgoing', error: e.message });
        } finally {
          delete activeOutgoing[fileId];
        }
      })();
    }
  }

  function cancelOutgoing(fileId) {
    if (activeOutgoing[fileId]) {
      activeOutgoing[fileId].cancelled = true;
      OpenDropWebRTC.broadcastMessage({ type: 'file-cancel', id: fileId });
      emit('transfer_cancelled', { id: fileId, direction: 'outgoing' });
    }
  }

  // ─── Incoming Transmit Receiver Pipeline ───
  function handleSignal(data, senderPeerId) {
    if (!data || !data.type) return;

    if (data.type === 'file-meta') {
      const { id, name, size, mime } = data;

      // Enforce receiver-side room file rule checks
      if (state.roomRules.canSendFiles === 'none') return;
      if (state.roomRules.canSendFiles === 'host' && senderPeerId !== state.hostPeerId) return;

      const conn = state.connections.find(c => c.peer === senderPeerId);
      const senderName = conn ? conn.username : 'Peer Device';

      const fileDetails = { id, name, size, mime, senderPeerId, senderName };

      if (state.roomRules.requirePermission) {
        pendingIncoming[id] = { details: fileDetails, bufferedChunks: [] };
        emit('incoming_permission_requested', fileDetails);
      } else {
        // Auto-accept
        initializeIncomingTransfer(fileDetails);
      }
    }

    if (data.type === 'file-cancel') {
      const { id } = data;
      if (activeIncoming[id]) {
        activeIncoming[id].cancelled = true;
        cleanupIncoming(id);
        emit('transfer_cancelled', { id, direction: 'incoming', reason: 'Sender cancelled' });
      }
      if (pendingIncoming[id]) {
        delete pendingIncoming[id];
        emit('transfer_cancelled', { id, direction: 'incoming', reason: 'Sender cancelled' });
      }
    }
  }

  // Accept approval trigger
  function acceptIncomingFile(fileId) {
    const pending = pendingIncoming[fileId];
    if (!pending) return;

    initializeIncomingTransfer(pending.details, pending.bufferedChunks);
    delete pendingIncoming[fileId];
  }

  // Reject approval trigger
  function rejectIncomingFile(fileId) {
    const pending = pendingIncoming[fileId];
    if (!pending) return;

    const sender = state.connections.find(c => c.peer === pending.details.senderPeerId);
    if (sender && sender.open) {
      try {
        sender.send({ type: 'file-cancel', id: fileId });
      } catch (e) {}
    }

    delete pendingIncoming[fileId];
    emit('transfer_cancelled', { id: fileId, direction: 'incoming', reason: 'Rejected' });
  }

  // Initialize stream hooks (FSAPI direct writing, Transform piping, or local buffer caching)
  async function initializeIncomingTransfer(details, initialChunks = []) {
    const { id, name, size, mime } = details;

    activeIncoming[id] = {
      details,
      receivedBytes: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      bytesSinceSpeed: 0,
      cancelled: false,
      writableStream: null,
      writer: null,
      memoryBuffers: []
    };

    const transfer = activeIncoming[id];

    emit('incoming_transfer_started', {
      id,
      name,
      size,
      senderName: details.senderName
    });

    // Check FSAPI support (Direct-to-disk picker writing)
    if (hasFSAPI()) {
      try {
        const extension = name.includes('.') ? name.split('.').pop() : '';
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: name,
          types: extension ? [{
            description: `${extension.toUpperCase()} File`,
            accept: { 'application/octet-stream': [`.${extension}`] }
          }] : []
        });

        transfer.writableStream = await fileHandle.createWritable();
        transfer.writer = transfer.writableStream.getWriter();
      } catch (e) {
        console.warn('FSAPI direct-to-disk picker dismissed, falling back to cached pipes.', e);
      }
    }

    // fallback to TransformStream response download pipe if FSAPI was skipped/unavailable
    if (!transfer.writer && hasTransformStream()) {
      try {
        const ts = new TransformStream();
        transfer.writer = ts.writable.getWriter();

        const downloadResponse = new Response(ts.readable);
        downloadResponse.blob().then(blob => {
          if (!transfer.cancelled) {
            triggerBlobDownload(blob, name);
          }
        });
      } catch (e) {
        console.warn('TransformStream fallback setup crashed, falling back to raw memory array.', e);
      }
    }

    // Trigger processing of any chunks that arrived while awaiting permission
    if (initialChunks.length > 0) {
      for (const rawChunk of initialChunks) {
        if (transfer.cancelled) break;
        await processParsedChunk(id, rawChunk);
      }
    }
  }

  // Handle incoming raw binary array buffer channel packet
  async function handleIncomingChunk(arrayBuffer, senderPeerId) {
    const parsed = parseHeaderedBuffer(arrayBuffer);
    if (!parsed) return;

    const { fileId, chunkIdx, payload } = parsed;

    // Buffer chunks if still awaiting permission approval
    if (pendingIncoming[fileId]) {
      pendingIncoming[fileId].bufferedChunks.push({ chunkIdx, payload });
      return;
    }

    const transfer = activeIncoming[fileId];
    if (!transfer || transfer.cancelled) return;

    await processParsedChunk(fileId, { chunkIdx, payload });
  }

  // Process chunk writes
  async function processParsedChunk(fileId, chunkData) {
    const transfer = activeIncoming[fileId];
    if (!transfer) return;

    const { payload } = chunkData;
    transfer.receivedBytes += payload.byteLength;
    transfer.bytesSinceSpeed += payload.byteLength;

    // Write chunk
    if (transfer.writer) {
      try {
        // Direct stream write
        await transfer.writer.write(new Uint8Array(payload));
      } catch (e) {
        console.error('Writable pipe broke', e);
        transfer.cancelled = true;
        cleanupIncoming(fileId);
        emit('transfer_failed', { id: fileId, direction: 'incoming', error: 'Disk write failed' });
        return;
      }
    } else {
      // Memory array buffer cache fallback
      transfer.memoryBuffers.push(payload);
    }

    // Calculate rates
    const now = Date.now();
    if (now - transfer.lastUpdate > SPEED_UPDATE_INTERVAL) {
      const windowTime = (now - transfer.lastUpdate) / 1000;
      const speedMBs = (transfer.bytesSinceSpeed / windowTime) / (1024 * 1024);
      const elapsedSec = (now - transfer.startTime) / 1000;
      const avgSpeed = transfer.receivedBytes / elapsedSec;
      const remaining = transfer.details.size - transfer.receivedBytes;
      const etaSec = avgSpeed > 0 ? remaining / avgSpeed : 0;

      emit('transfer_progress', {
        id: fileId,
        direction: 'incoming',
        percentage: Math.min(100, Math.round((transfer.receivedBytes / transfer.details.size) * 100)),
        transferred: transfer.receivedBytes,
        speedMbps: (speedMBs * 8).toFixed(1),
        eta: Math.round(etaSec)
      });

      transfer.bytesSinceSpeed = 0;
      transfer.lastUpdate = now;
    }

    // Finalize on full completion
    if (transfer.receivedBytes >= transfer.details.size) {
      try {
        if (transfer.writer) {
          await transfer.writer.close();
          transfer.writer = null;
        }

        if (transfer.writableStream) {
          transfer.writableStream = null;
        }

        if (transfer.memoryBuffers.length > 0) {
          // compile memory chunks and trigger download
          const mergedBlob = new Blob(transfer.memoryBuffers, { type: transfer.details.mime });
          triggerBlobDownload(mergedBlob, transfer.details.name);
          transfer.memoryBuffers = [];
        }

        emit('transfer_completed', {
          id: fileId,
          direction: 'incoming',
          name: transfer.details.name,
          size: transfer.details.size
        });
      } catch (e) {
        console.error('Completion finalize error', e);
        emit('transfer_failed', { id: fileId, direction: 'incoming', error: 'Finalize failed' });
      } finally {
        delete activeIncoming[fileId];
      }
    }
  }

  // Trigger browser download via object URL href
  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const trigger = document.createElement('a');
    trigger.href = url;
    trigger.download = filename;
    document.body.appendChild(trigger);
    trigger.click();
    document.body.removeChild(trigger);
    // Revoke reference after a slight delay to preserve downloading lifecycle
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  function cancelIncoming(fileId) {
    if (activeIncoming[fileId]) {
      activeIncoming[fileId].cancelled = true;
      const senderId = activeIncoming[fileId].details.senderPeerId;
      const sender = state.connections.find(c => c.peer === senderId);
      if (sender && sender.open) {
        try { sender.send({ type: 'file-cancel', id: fileId }); } catch(e) {}
      }
      cleanupIncoming(fileId);
      emit('transfer_cancelled', { id: fileId, direction: 'incoming' });
    }
  }

  function cleanupIncoming(fileId) {
    const transfer = activeIncoming[fileId];
    if (transfer) {
      if (transfer.writer) {
        try { transfer.writer.abort(); } catch(e) {}
      }
      delete activeIncoming[fileId];
    }
  }

  // Cleanup pending transfers when a peer drops
  function cleanupPeerTransfers(peerId) {
    // Outgoing
    Object.keys(activeOutgoing).forEach(id => {
      // Outgoing is sent to everyone, but if no connections remain, fail
      if (state.connections.length === 0) {
        cancelOutgoing(id);
      }
    });

    // Incoming
    Object.keys(activeIncoming).forEach(id => {
      if (activeIncoming[id].details.senderPeerId === peerId) {
        activeIncoming[id].cancelled = true;
        cleanupIncoming(id);
        emit('transfer_failed', { id, direction: 'incoming', error: 'Peer disconnected' });
      }
    });

    // Pending
    Object.keys(pendingIncoming).forEach(id => {
      if (pendingIncoming[id].details.senderPeerId === peerId) {
        delete pendingIncoming[id];
        emit('transfer_cancelled', { id, direction: 'incoming', reason: 'Peer disconnected' });
      }
    });
  }

  return {
    sendFiles,
    cancelOutgoing,
    cancelIncoming,
    handleSignal,
    acceptIncomingFile,
    rejectIncomingFile,
    handleIncomingChunk,
    cleanupPeerTransfers
  };
})();

// Attach globally
window.OpenDropStream = OpenDropStream;
