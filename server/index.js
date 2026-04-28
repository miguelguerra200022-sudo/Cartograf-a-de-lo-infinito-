// Cartografía de lo Infinito — Express Server
// Serves the frontend static files and provides the REST API
// for authentication, sector management, and the Quark economy.

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const Database = require('better-sqlite3');
const fs = require('fs');

const createAuthRouter = require('./routes/auth');
const createSectorsRouter = require('./routes/sectors');
const createEconomyRouter = require('./routes/economy');
const { preGenerateAnomalies } = require('./salt-wall');

const PORT = process.env.PORT || 3001;

// ─── Database Setup ───
const dbDir = path.join(__dirname, 'db');
const dbPath = path.join(dbDir, 'universe.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf-8');
db.exec(schema);

console.log('[DB] SQLite database initialized at', dbPath);

// Pre-generate some anomalies around the starting sector
const anomalyCount = preGenerateAnomalies(db, 1500, -450, 0, 20);
console.log(`[SALT WALL] Pre-generated ${anomalyCount} anomalies in starting region`);

// ─── Express App ───
const app = express();

// Security headers (relaxed CSP for CDN scripts)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

app.use(cors());
app.use(express.json());

// Rate limiting (simple in-memory)
const rateLimits = new Map();
function rateLimit(windowMs, maxRequests) {
    return (req, res, next) => {
        const key = req.ip + req.path;
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!rateLimits.has(key)) {
            rateLimits.set(key, []);
        }

        const timestamps = rateLimits.get(key).filter(t => t > windowStart);
        timestamps.push(now);
        rateLimits.set(key, timestamps);

        if (timestamps.length > maxRequests) {
            return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta más tarde.' });
        }

        next();
    };
}

// Apply rate limiting to API routes
app.use('/api/', rateLimit(60000, 100)); // 100 requests per minute

// ─── API Routes ───
app.use('/api/auth', createAuthRouter(db));
app.use('/api/sectors', createSectorsRouter(db));
app.use('/api/economy', createEconomyRouter(db));

// Health check
app.get('/api/health', (req, res) => {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const claimCount = db.prepare('SELECT COUNT(*) as count FROM sector_claims').get();
    const anomalyCount = db.prepare('SELECT COUNT(*) as count FROM sector_anomalies').get();

    res.json({
        status: 'online',
        engine: 'Cartografía de lo Infinito',
        version: '1.0.0',
        database: {
            users: userCount.count,
            claims: claimCount.count,
            anomalies: anomalyCount.count,
        },
        uptime: process.uptime(),
    });
});

// ─── Static Files ───
// Serve the frontend from the project root
const projectRoot = path.join(__dirname, '..');
app.use(express.static(projectRoot, {
    setHeaders: (res, filePath) => {
        // WASM files need correct MIME type
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
    },
}));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
});

// ─── Start Server ───
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  🔭 CARTOGRAFÍA DE LO INFINITO — ONLINE     ║`);
    console.log(`  ║  Servidor: http://localhost:${PORT}              ║`);
    console.log(`  ║  API:      http://localhost:${PORT}/api/health   ║`);
    console.log(`  ╚══════════════════════════════════════════════╝\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SERVER] Shutting down...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    db.close();
    process.exit(0);
});
