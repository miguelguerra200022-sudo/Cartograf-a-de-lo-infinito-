# 🔭 Cartografía de lo Infinito

**Deterministic Procedural Universe Generator** — A universe that exists as equations, not data.

## Architecture

```
Hash(MASTER_SEED + X,Y,Z)  →  ChaCha20 PRNG  →  OpenSimplex Noise  →  L-Systems  →  3D Scene
     (SHA-256)                 (Deterministic)    (Terrain)             (Ruins)       (Three.js)
```

### Core Principle
> *\"Don't store the planet — store the equation.\"*

Given the same master seed and coordinates `(X, Y, Z)`, this engine produces **byte-identical output** across all platforms, all users, and all time. The universe is immutable and infinite.

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Engine | Rust → WebAssembly (91KB) | Client-side procedural generation at near-native speed |
| Noise | OpenSimplex 2 (fractal Brownian motion) | Terrain heightmaps and geological features |
| Ruins | L-Systems (Lindenmayer grammars) | Procedural alien ruins with 5 architectural morphologies |
| Hashing | SHA-256 | Deterministic sector seed derivation |
| PRNG | ChaCha20Rng | Cryptographically-quality randomness from sector seeds |
| 3D Render | Three.js (WebGL) | Real-time planet systems, terrain, ruins, effects |
| Backend | Node.js / Express | Authentication, economy, Salt Wall anti-cheat |
| Database | SQLite (WAL mode) | Users, sector claims, anomalies, transactions |

## Security: The Salt Wall

The WASM engine generates **geology and visuals only**. It does NOT contain:
- Rarity classifications
- Loot tables
- Resource values

Those are stored server-side in SQLite and delivered via authenticated API after fuel expenditure. The client can never datamine what's valuable.

## Features

- 🌌 **3D Space Exploration** — Full Three.js scene with stars, planets, atmospheres, and terrain
- 🏛️ **Fractal Alien Ruins** — L-System derivations rendered as 3D turtle graphics
- 🎵 **Procedural Audio** — Ambient space drones generated via Web Audio API
- 🎲 **Random Jump** — Discover the infinite with one click
- ⚡ **Discovery Rarity** — Common → Uncommon → Rare → Epic → Legendary
- 🚀 **Fuel Economy** — Each scan costs fuel, creating strategic exploration
- 🔒 **Anti-Cheat** — Server-side loot determination via Salt Wall
- ⚙️ **Quality Levels** — Low/Medium/High for any hardware

## Quick Start

```bash
# 1. Build the Rust engine (if needed)
cd procedural_engine
cargo test
wasm-pack build --release --target web

# 2. Install backend dependencies
cd ../server
npm install

# 3. Start the server
npm start
# → Open http://localhost:3001
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Login → JWT |
| GET | `/api/auth/profile` | Yes | User profile |
| POST | `/api/sectors/scan` | Yes | Scan sector (costs fuel) |
| POST | `/api/sectors/claim` | Yes | Claim sector ownership |
| GET | `/api/sectors/check/:x/:y/:z` | No | Check sector owner |
| GET | `/api/economy/balance` | Yes | Get quark/fuel balance |
| POST | `/api/economy/purchase` | Yes | Buy quark packs |
| POST | `/api/economy/refuel` | Yes | Convert quarks → fuel |
| GET | `/api/economy/history` | Yes | Transaction log |

## Project Status

- [x] **Phase 1**: Mathematical engine (Rust → WASM)
- [x] **Phase 2**: Three.js 3D client with real-time rendering
- [x] **Phase 3**: Backend authority server + Quark economy
