// Sector routes — scan, claim, check ownership, nearby sectors.
// Implements the Salt Wall anti-cheat pattern + WASM deterministic validation.

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { deriveSectorLoot } = require('../salt-wall');

// Server-side WASM engine for deterministic validation
let wasmEngine = null;
try {
    wasmEngine = require('../wasm-engine/procedural_engine');
    console.log('[SECTORS] WASM engine loaded for server-side validation');
} catch (e) {
    console.warn('[SECTORS] WASM engine not available, validation disabled:', e.message);
}

function createSectorsRouter(db) {
    const router = express.Router();

    // POST /api/sectors/scan — Spend fuel, get hidden loot info
    router.post('/scan', authMiddleware, (req, res) => {
        const { x, y, z } = req.body;

        if (x === undefined || y === undefined || z === undefined) {
            return res.status(400).json({ error: 'Coordenadas (x, y, z) requeridas' });
        }

        // Check user has fuel
        const user = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(req.user.userId);
        if (!user || user.fuel <= 0) {
            return res.status(403).json({ error: 'Sin combustible. Compra más Quarks para recargar.' });
        }

        // Deduct fuel
        db.prepare('UPDATE users SET fuel = fuel - 1, sectors_explored = sectors_explored + 1 WHERE id = ?')
            .run(req.user.userId);

        // Log transaction
        db.prepare(
            'INSERT INTO transactions (user_id, type, amount, currency, description) VALUES (?, ?, ?, ?, ?)'
        ).run(req.user.userId, 'scan', -1, 'fuel', `Escaneo sector (${x}, ${y}, ${z})`);

        // The Salt Wall: derive hidden loot server-side only
        const loot = deriveSectorLoot(x, y, z);

        // Check if already discovered
        const existing = db.prepare(
            'SELECT discovered_by FROM sector_anomalies WHERE x = ? AND y = ? AND z = ?'
        ).get(x, y, z);

        let firstDiscovery = false;
        if (loot.rarity !== 'common' && !existing) {
            // Record anomaly discovery
            db.prepare(`
                INSERT OR IGNORE INTO sector_anomalies (x, y, z, rarity_class, loot_type, loot_value, loot_data, discovered_by, discovered_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(x, y, z, loot.rarity, loot.lootType, loot.lootValue,
                JSON.stringify({ name: loot.lootName }), req.user.userId);
            firstDiscovery = true;

            // Award quarks for discovery
            const reward = loot.lootValue;
            db.prepare('UPDATE users SET quarks = quarks + ? WHERE id = ?').run(reward, req.user.userId);
            db.prepare(
                'INSERT INTO transactions (user_id, type, amount, currency, description) VALUES (?, ?, ?, ?, ?)'
            ).run(req.user.userId, 'loot', reward, 'quarks', `Descubrimiento: ${loot.lootName}`);
        }

        // Return loot info (this is what the client uses to enhance the WASM render)
        const updatedUser = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(req.user.userId);

        res.json({
            sector: { x, y, z },
            loot: loot.rarity !== 'common' ? {
                rarity: loot.rarity,
                type: loot.lootType,
                name: loot.lootName,
                value: loot.lootValue,
                firstDiscovery,
            } : null,
            resources: {
                quarks: updatedUser.quarks,
                fuel: updatedUser.fuel,
            },
        });
    });

    // POST /api/sectors/claim — Claim ownership of a sector
    router.post('/claim', authMiddleware, (req, res) => {
        const { x, y, z } = req.body;
        const claimCost = 100; // quarks

        if (x === undefined || y === undefined || z === undefined) {
            return res.status(400).json({ error: 'Coordenadas requeridas' });
        }

        // Check if already claimed
        const existing = db.prepare(
            'SELECT user_id FROM sector_claims WHERE x = ? AND y = ? AND z = ?'
        ).get(x, y, z);

        if (existing) {
            return res.status(409).json({ error: 'Sector ya reclamado por otro explorador' });
        }

        // Check user has enough quarks
        const user = db.prepare('SELECT quarks FROM users WHERE id = ?').get(req.user.userId);
        if (!user || user.quarks < claimCost) {
            return res.status(403).json({ error: `Necesitas ${claimCost} Quarks para reclamar un sector` });
        }

        // Deduct quarks and claim
        db.prepare('UPDATE users SET quarks = quarks - ? WHERE id = ?').run(claimCost, req.user.userId);
        db.prepare(
            'INSERT INTO sector_claims (user_id, x, y, z, claim_type) VALUES (?, ?, ?, ?, ?)'
        ).run(req.user.userId, x, y, z, 'standard');

        db.prepare(
            'INSERT INTO transactions (user_id, type, amount, currency, description) VALUES (?, ?, ?, ?, ?)'
        ).run(req.user.userId, 'claim', -claimCost, 'quarks', `Reclamar sector (${x}, ${y}, ${z})`);

        const updatedUser = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(req.user.userId);

        res.json({
            message: 'Sector reclamado exitosamente',
            claim: { x, y, z, claimedBy: req.user.username },
            resources: { quarks: updatedUser.quarks, fuel: updatedUser.fuel },
        });
    });

    // GET /api/sectors/check/:x/:y/:z — Check who owns a sector
    router.get('/check/:x/:y/:z', (req, res) => {
        const { x, y, z } = req.params;

        const claim = db.prepare(`
            SELECT sc.*, u.username
            FROM sector_claims sc
            JOIN users u ON u.id = sc.user_id
            WHERE sc.x = ? AND sc.y = ? AND sc.z = ?
        `).get(parseInt(x), parseInt(y), parseInt(z));

        res.json({
            claimed: !!claim,
            owner: claim ? claim.username : null,
            claimedAt: claim ? claim.claimed_at : null,
        });
    });

    // GET /api/sectors/nearby?x=&y=&z=&radius= — Get claimed sectors nearby
    router.get('/nearby', (req, res) => {
        const x = parseInt(req.query.x) || 0;
        const y = parseInt(req.query.y) || 0;
        const z = parseInt(req.query.z) || 0;
        const radius = Math.min(parseInt(req.query.radius) || 10, 50);

        const claims = db.prepare(`
            SELECT sc.x, sc.y, sc.z, sc.claim_type, u.username
            FROM sector_claims sc
            JOIN users u ON u.id = sc.user_id
            WHERE sc.x BETWEEN ? AND ?
              AND sc.y BETWEEN ? AND ?
              AND sc.z BETWEEN ? AND ?
            LIMIT 100
        `).all(x - radius, x + radius, y - radius, y + radius, z - radius, z + radius);

        res.json({ center: { x, y, z }, radius, claims });
    });

    // POST /api/sectors/validate — WASM server-side validation
    // The client sends a sector hash, the server re-generates the sector
    // using the same WASM engine and verifies the data is authentic.
    router.post('/validate', authMiddleware, (req, res) => {
        if (!wasmEngine) {
            return res.status(503).json({ error: 'Validación WASM no disponible' });
        }

        const { x, y, z, clientHash } = req.body;
        if (x === undefined || y === undefined || z === undefined) {
            return res.status(400).json({ error: 'Coordenadas requeridas' });
        }

        try {
            const startTime = Date.now();
            const jsonStr = wasmEngine.get_sector_data(BigInt(x), BigInt(y), BigInt(z));
            const serverData = JSON.parse(jsonStr);
            const elapsed = Date.now() - startTime;

            const valid = !clientHash || serverData.sector_hash === clientHash;

            if (!valid) {
                console.warn(`[ANTI-CHEAT] Hash mismatch for (${x},${y},${z}): client=${clientHash} server=${serverData.sector_hash}`);
            }

            res.json({
                valid,
                serverHash: serverData.sector_hash,
                planetCount: serverData.star_system?.planets?.length || 0,
                validationTimeMs: elapsed,
            });
        } catch (e) {
            console.error('[WASM VALIDATION ERROR]', e);
            res.status(500).json({ error: 'Error en validación del sector' });
        }
    });

    return router;
}

module.exports = createSectorsRouter;
