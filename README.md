<div align="center">

<br/>

```
 ██████╗ ██████╗ ███████╗███╗   ██╗██████╗ ██████╗  ██████╗ ██████╗ 
██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗██╔══██╗██╔═══██╗██╔══██╗
██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║  ██║██████╔╝██║   ██║██████╔╝
██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║  ██║██╔══██╗██║   ██║██╔═══╝ 
╚██████╔╝██║     ███████╗██║ ╚████║██████╔╝██║  ██║╚██████╔╝██║     
 ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝    V2
```

### `Serverless · Full-Mesh · Peer-to-Peer · File Exchange`

<br/>

[![Live Demo](https://img.shields.io/badge/🌐_LIVE_DEMO-opendrop.netlify.app-00FFB3?style=for-the-badge&labelColor=0D0D0D)](https://opendrop.netlify.app)
&nbsp;
[![PWA](https://img.shields.io/badge/📱_PWA-Offline--First-F59E0B?style=for-the-badge&labelColor=0D0D0D)](https://opendrop.netlify.app)
&nbsp;
[![WebRTC](https://img.shields.io/badge/⚡_WebRTC-Full--Mesh-7C3AED?style=for-the-badge&labelColor=0D0D0D)](https://opendrop.netlify.app)
&nbsp;
[![JS](https://img.shields.io/badge/🟨_Vanilla-ES6%2B-EAB308?style=for-the-badge&labelColor=0D0D0D)](https://opendrop.netlify.app)

<br/>

> **No servers. No cloud. No compromise.**
> Direct device-to-device encrypted transfers at hardware speeds.

<br/>

</div>

---

<br/>

## ✦ What is OpenDrop V2?

**OpenDrop V2** is a completely serverless, offline-first **WebRTC full-mesh P2P** file distribution and messaging client — built entirely on client-side browser technology.

It uses transient **PeerJS signaling** to bootstrap direct, encrypted tunnels between devices. Once connected, **zero bytes** touch any central server. Files, streams, and messages travel device-to-device across local Wi-Fi or cellular — unlocking extreme throughput and absolute privacy.

> 💡 **Try it now:** Open [opendrop.netlify.app](https://opendrop.netlify.app) on your laptop, scan the room code on your phone, and drop a file. Watch it land in under a second.

<br/>

---

<br/>

## 🆚 V1 vs V2 — The Engineering Leap

| | V1 _(Legacy)_ | V2 _(Current)_ |
|---|---|---|
| **Topology** | ☁️ Star / Hub-and-Spoke | 🕸️ Full Direct Mesh |
| **Binary Protocol** | ❌ Base64 / JSON text | ✅ 24-byte raw ArrayBuffer headers |
| **Payload Overhead** | +33% inflation | 0% — raw binary |
| **Flow Control** | ❌ None (socket dropouts) | ✅ SCTP Sliding-Window Backpressure |
| **Transfer Speeds** | ~5 Mbps ceiling | **30–80+ Mbps** |
| **Host Failover** | ❌ Room dies with host | ✅ O(1) Deterministic Host Election |
| **Mobile Support** | ❌ Routing issues | ✅ STUN NAT traversal |
| **RAM Usage** | Uncontrolled (tab crashes) | < 80 MB enforced |
| **Offline / PWA** | ❌ | ✅ Service Worker cache-first |
| **Visualizer** | ❌ | ✅ 60 FPS Canvas Particle Mesh |

<br/>

---

<br/>

## 🏗️ Core Architecture — Four Breakthroughs

<br/>

### `[01]` ⚡ Zero-Serialization Binary Pipeline — _15× Speed Boost_

```
V1:  File → JSON stringify → Base64 encode → Send  ❌ +33% payload, GC chokes, tab crashes
V2:  File → Slice 64KB chunks → Prepend 24B header → Send raw ArrayBuffer  ✅ Pure hardware speed
```

Files are sliced into exact **64 KB binary packets** with little-endian `Uint32` pointers, streaming straight over direct SCTP channels. The result: **30–80+ Mbps** sustained throughput depending on router bandwidth — no serialization tax, no garbage-collector pressure.

<br/>

### `[02]` 🌊 SCTP Sliding-Window Backpressure Flow Control

```
Chunk Sender
    │
    ├─► Poll  RTCDataChannel.bufferedAmount
    │         │
    │    ┌────▼─────────────────┐
    │    │ bufferedAmount > 4MB │──► Suspend 15ms ──┐
    │    └─────────────────────┘                    │
    │         │ < 4MB                               │
    └─────────▼─────────────────◄───────────────────┘
         Send next chunk (RAM < 80 MB enforced)
```

High-speed streaming without backpressure overflows slower receivers' network buffers — causing socket dropouts and incomplete transfers. V2's sliding-window throttle solves this cleanly.

<br/>

### `[03]` 👑 Decentralized Host Elections & Lobby Governance

Peers are assigned alphabetical connection slots (`""` → `"o"`). When the active Host disconnects, **every remaining peer independently executes `determineHostId()`** in O(1) — electing the lowest slot as the new admin with zero locking conflicts and zero downtime.

```
Slots:  [""(Host)] ── ["b"] ── ["c"] ── ["d"]
                         ↑
           Host drops → "b" auto-elected, no negotiation needed.
```

Lobby locks allow the Host to block uninvited peers from entering mid-session.

<br/>

### `[04]` 🎨 60 FPS Interactive Particle Mesh Visualizer

A glassmorphic dark-theme HTML5 Canvas dashboard renders the live network topology in real time. A trigonometric particle engine computes **Euclidean distance matrices** between all active peers, drawing neon-lime connecting links that pulse and scale dynamically during active file transfers.

<br/>

---

<br/>

## 📡 WebRTC Full-Mesh Topology

For **N** connected devices, OpenDrop V2 establishes one direct `RTCDataChannel` per pair:

$$C = \frac{N(N-1)}{2}$$

```
    ┌──────────────────────────────────────────────────┐
    │                                                  │
    │   [Peer A · Host · Slot ""]  ◄══════════════► [Peer B · Slot "b"]
    │            ║                                        ║
    │            ║◄══════════════════════════════════════►║
    │            ▼                                        ▼
    │       [Peer C · Slot "c"] ◄════════════════► [Peer D · Slot "d"]
    │                                                  │
    │   NAT Traversal via Google STUN (stun.l.google.com:19302)        │
    └──────────────────────────────────────────────────┘
```

Every peer talks **directly** to every other peer. No relay. No bottleneck.

<br/>

---

<br/>

## 📦 24-Byte Raw Binary Packet Structure

Every chunk prepends a compact binary header before the raw payload:

```
Byte offset:  0        4        8        12       16       20       24
              ┌────────┬────────┬────────┬────────┬────────┬────────┐
              │                  File ID (16 bytes, ASCII)          │
              ├────────────────────────────────────────────┬────────┤
              │            Chunk Index (Uint32 LE)         │Payload │
              ├────────────────────────────────────────────┤Size    │
              │          Chunk Payload Size (Uint32 LE)    │(4B)    │
              └────────────────────────────────────────────┴────────┘
              │                                                      │
              │         Raw File Chunk Payload  (up to 64 KB)       │
              │                                                      │
              └──────────────────────────────────────────────────────┘
```

No JSON. No Base64. Pure binary from disk to socket.

<br/>

---

<br/>

## 🗂️ Repository Structure

```
OpenDrop V2/
│
├── 📁 assets/              → SVG UI icons and vector graphics
├── 📁 css/                 → Glassmorphic theme stylesheets
│
├── 📁 docs/
│   ├── README.md           → Mentoring manual compilation guide
│   └── Technical_Architecture.md  → System flowcharts & protocol contracts
│
├── 📁 js/                  → Decoupled core JavaScript modules
│   ├── config.js           → ICE configs, STUN servers, transfer limits
│   ├── state.js            → Event-driven Observer State Store (Pub-Sub)
│   ├── stream.js           → Binary ArrayBuffer slicing & packet assembly
│   ├── ui.js               → DOM controller + 60 FPS Canvas mesh renderer
│   ├── utils.js            → Cryptographic UUIDs & browser feature checks
│   └── webrtc.js           → PeerJS signaling, slot probing, consensus
│
├── index.html              → Marketing landing page
├── app.html                → Main transfer workspace
├── manifest.json           → PWA standalone configuration
├── sw.js                   → Service Worker — offline cache-first interceptor
└── netlify.toml            → SPA routing + custom Service Worker headers
```

<br/>

---

<br/>

## 🚀 Run Locally

No Node.js. No build step. No friction.

```bash
# 1. Clone the repo
git clone https://github.com/Utkarsh7106/opendrop-v2.git

# 2. Enter the project directory
cd "OpenDrop V2"

# 3. Start a local server (Python 3 built-in)
python -m http.server 8000

# 4. Open in browser
#    → http://localhost:8000
```

> **Test P2P locally:** Open two browser tabs — one in normal mode, one in incognito. Create a room in tab one, join with the code in tab two. Drop a file and watch it transfer at full local-network speed.

<br/>

---

<br/>

## 💼 Recruiter Quick-Start

| Asset | Link |
|---|---|
| 🌐 Live Application | [opendrop.netlify.app](https://opendrop.netlify.app) |
| 📄 Technical Architecture | [`/docs/Technical_Architecture.md`](./docs/Technical_Architecture.md) |
| 📚 10-Chapter Prep Manual | [`/docs/OpenDrop_Technical_Prep_Manual.pdf`](./docs/OpenDrop_Technical_Prep_Manual.pdf) |

<br/>

---

<br/>

<div align="center">

## ⚡ Performance Benchmarks

| Metric | Result |
|---|---|
| 🚀 Sustained Transfer Speed | **30 – 80+ Mbps** |
| 🧠 Peak Browser RAM Usage | **< 80 MB** |
| 🔗 Connections (N peers) | **N(N−1)/2 direct tunnels** |
| ⚙️ Host Election Complexity | **O(1)** |
| 📦 Binary Header Size | **24 bytes** |
| 🎯 Chunk Size | **64 KB** |
| 🎨 Canvas Render Rate | **60 FPS** |

</div>

<br/>

---

<br/>

<div align="center">

**Built by [Utkarsh Mishra · Rinzler](https://utkarsh7106.netlify.app)**

_Final-year Computer Engineering · RAIT, Mumbai_

`Full-Stack Web Architecture` &nbsp;·&nbsp; `P2P Systems` &nbsp;·&nbsp; `WebRTC` &nbsp;·&nbsp; `Progressive Web Applications`

<br/>

[![Portfolio](https://img.shields.io/badge/🔗_Portfolio-utkarsh7106.netlify.app-00FFB3?style=for-the-badge&labelColor=0D0D0D)](https://utkarsh7106.netlify.app)
&nbsp;
[![GitHub](https://img.shields.io/badge/🐙_GitHub-Utkarsh7106-ffffff?style=for-the-badge&labelColor=0D0D0D)](https://github.com/Utkarsh7106)

<br/>

_No servers were harmed in the making of this transfer._

</div>
