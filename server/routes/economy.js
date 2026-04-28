// Economy routes — balance, purchase quarks, refuel, transaction history.

const express = require('express');
const { authMiddleware } = require('../middleware/auth');

function createEconomyRouter(db) {
    const router = express.Router();

    // GET /api/economy/balance
    router.get('/balance', authMiddleware, (req, res) => {
        const user = db.prepare(
            'SELECT quarks, fuel, sectors_explored FROM users WHERE id = ?'
        ).get(req.user.userId);

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        res.json({
            quarks: user.quarks,
            fuel: user.fuel,
            sectors_explored: user.sectors_explored,
        });
    });

    // POST /api/economy/purchase — Simulate quark purchase (no real payment)
    router.post('/purchase', authMiddleware, (req, res) => {
        const { pack } = req.body;

        const packs = {
            starter:  { quarks: 100,  price: 1.99,  label: 'Pack Iniciante' },
            explorer: { quarks: 500,  price: 4.99,  label: 'Pack Explorador' },
            admiral:  { quarks: 2000, price: 14.99, label: 'Pack Almirante' },
            titan:    { quarks: 10000, price: 49.99, label: 'Pack Titán' },
        };

        const selected = packs[pack];
        if (!selected) {
            return res.status(400).json({
                error: 'Pack inválido',
                available: Object.keys(packs).map(k => ({ id: k, ...packs[k] })),
            });
        }

        // Add quarks (simulated payment)
        db.prepare('UPDATE users SET quarks = quarks + ? WHERE id = ?')
            .run(selected.quarks, req.user.userId);

        db.prepare(
            'INSERT INTO transactions (user_id, type, amount, currency, description) VALUES (?, ?, ?, ?, ?)'
        ).run(req.user.userId, 'purchase', selected.quarks, 'quarks', `Compra: ${selected.label}`);

        const user = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(req.user.userId);

        res.json({
            message: `Compra exitosa: ${selected.label} (+${selected.quarks} Quarks)`,
            resources: { quarks: user.quarks, fuel: user.fuel },
        });
    });

    // POST /api/economy/refuel — Convert quarks to fuel
    router.post('/refuel', authMiddleware, (req, res) => {
        const quarkCost = 25;
        const fuelGained = 5;

        const user = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(req.user.userId);
        if (!user || user.quarks < quarkCost) {
            return res.status(403).json({
                error: `Necesitas ${quarkCost} Quarks para recargar combustible`,
            });
        }

        db.prepare('UPDATE users SET quarks = quarks - ?, fuel = fuel + ? WHERE id = ?')
            .run(quarkCost, fuelGained, req.user.userId);

        db.prepare(
            'INSERT INTO transactions (user_id, type, amount, currency, description) VALUES (?, ?, ?, ?, ?)'
        ).run(req.user.userId, 'refuel', -quarkCost, 'quarks', `Recarga: +${fuelGained} combustible`);

        const updated = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(req.user.userId);

        res.json({
            message: `Recargado: +${fuelGained} combustible`,
            resources: { quarks: updated.quarks, fuel: updated.fuel },
        });
    });

    // GET /api/economy/history — Transaction history
    router.get('/history', authMiddleware, (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        const transactions = db.prepare(`
            SELECT id, type, amount, currency, description, created_at
            FROM transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(req.user.userId, limit, offset);

        const total = db.prepare(
            'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?'
        ).get(req.user.userId);

        res.json({ transactions, total: total.count, limit, offset });
    });

    // ─── DAILY REWARD (Server-validated, 24h cooldown) ───
    router.post('/daily', authMiddleware, (req, res) => {
        const userId = req.user.userId;

        // Check last daily claim from transactions
        const lastClaim = db.prepare(`
            SELECT created_at FROM transactions
            WHERE user_id = ? AND type = 'daily_reward'
            ORDER BY created_at DESC LIMIT 1
        `).get(userId);

        if (lastClaim) {
            const lastTime = new Date(lastClaim.created_at).getTime();
            const now = Date.now();
            const hoursElapsed = (now - lastTime) / (1000 * 60 * 60);

            if (hoursElapsed < 24) {
                const remaining = Math.ceil(24 - hoursElapsed);
                return res.status(429).json({
                    error: `Recompensa diaria no disponible. Vuelve en ${remaining}h.`,
                    nextAvailable: new Date(lastTime + 24 * 60 * 60 * 1000).toISOString(),
                });
            }
        }

        // Calculate streak from consecutive daily claims
        const recentClaims = db.prepare(`
            SELECT created_at FROM transactions
            WHERE user_id = ? AND type = 'daily_reward'
            ORDER BY created_at DESC LIMIT 7
        `).all(userId);

        let streak = 1;
        for (let i = 0; i < recentClaims.length - 1; i++) {
            const diff = new Date(recentClaims[i].created_at) - new Date(recentClaims[i+1].created_at);
            const hours = diff / (1000 * 60 * 60);
            if (hours >= 20 && hours <= 48) {
                streak++;
            } else {
                break;
            }
        }

        // Rewards scale with streak (server decides amounts)
        const baseQuarks = 50;
        const baseFuel = 3;
        const streakMultiplier = Math.min(streak, 7); // Cap at 7x

        const quarksReward = baseQuarks * streakMultiplier;
        const fuelReward = baseFuel + Math.floor(streakMultiplier / 2);

        // Apply rewards atomically
        db.prepare('UPDATE users SET quarks = quarks + ?, fuel = fuel + ? WHERE id = ?')
            .run(quarksReward, fuelReward, userId);

        db.prepare(`
            INSERT INTO transactions (user_id, type, amount, currency, description)
            VALUES (?, 'daily_reward', ?, 'quarks', ?)
        `).run(userId, quarksReward, `Día ${streak}: +${quarksReward}Q +${fuelReward}F`);

        const updated = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(userId);

        res.json({
            message: `¡Día ${streak}! +${quarksReward} Quarks, +${fuelReward} Fuel`,
            reward: { quarks: quarksReward, fuel: fuelReward },
            streak,
            resources: { quarks: updated.quarks, fuel: updated.fuel },
        });
    });

    // ─── GACHA PULL (Server-side RNG, pity system) ───
    router.post('/gacha', authMiddleware, (req, res) => {
        const userId = req.user.userId;
        const { multi } = req.body; // true = 10-pull
        const SINGLE_COST = 50;
        const MULTI_COST = 450; // Discount for 10

        const cost = multi ? MULTI_COST : SINGLE_COST;
        const pullCount = multi ? 10 : 1;

        // Check affordability
        const user = db.prepare('SELECT quarks FROM users WHERE id = ?').get(userId);
        if (!user || user.quarks < cost) {
            return res.status(403).json({
                error: `Necesitas ${cost} Quarks. Tienes ${user?.quarks || 0}.`,
            });
        }

        // Pity counter (pulls since last epic+)
        const pityStat = db.prepare(`
            SELECT COUNT(*) as pulls FROM transactions
            WHERE user_id = ? AND type = 'gacha'
            AND created_at > COALESCE(
                (SELECT created_at FROM transactions
                 WHERE user_id = ? AND type = 'gacha' AND description LIKE '%ÉPICO%'
                 ORDER BY created_at DESC LIMIT 1),
                '1970-01-01')
        `).get(userId, userId);
        let pityCounter = pityStat?.pulls || 0;

        // Roll results server-side
        const results = [];
        for (let i = 0; i < pullCount; i++) {
            pityCounter++;
            let rarity, reward;

            // Pity guarantee: Epic at 50 pulls
            if (pityCounter >= 50) {
                rarity = 'epic';
                pityCounter = 0;
            } else {
                const roll = Math.random();
                if (roll < 0.001) rarity = 'mythic';
                else if (roll < 0.01) rarity = 'legendary';
                else if (roll < 0.05) rarity = 'epic';
                else if (roll < 0.15) rarity = 'rare';
                else if (roll < 0.40) rarity = 'uncommon';
                else rarity = 'common';
            }

            // Reward table (server-determined values)
            const rewards = {
                common:    { type: 'fuel', amount: 2, label: 'Célula de Combustible' },
                uncommon:  { type: 'quarks', amount: 30, label: 'Fragmento Cuántico' },
                rare:      { type: 'quarks', amount: 100, label: 'Núcleo de Neutrones' },
                epic:      { type: 'quarks', amount: 500, label: 'Cristal de Vacío' },
                legendary: { type: 'quarks', amount: 2000, label: 'Reliquia Ancestral' },
                mythic:    { type: 'quarks', amount: 10000, label: '⭐ Singularidad Cósmica' },
            };

            reward = rewards[rarity];
            results.push({ rarity, ...reward });
        }

        // Apply all rewards atomically
        let totalQuarks = 0;
        let totalFuel = 0;
        for (const r of results) {
            if (r.type === 'quarks') totalQuarks += r.amount;
            else if (r.type === 'fuel') totalFuel += r.amount;
        }

        const bestRarity = results.reduce((best, r) => {
            const order = ['common','uncommon','rare','epic','legendary','mythic'];
            return order.indexOf(r.rarity) > order.indexOf(best) ? r.rarity : best;
        }, 'common');

        db.prepare('UPDATE users SET quarks = quarks - ? + ?, fuel = fuel + ? WHERE id = ?')
            .run(cost, totalQuarks, totalFuel, userId);

        const rarityLabels = { common: 'COMÚN', uncommon: 'POCO COMÚN', rare: 'RARO', epic: 'ÉPICO', legendary: 'LEGENDARIO', mythic: 'MÍTICO' };
        db.prepare(`
            INSERT INTO transactions (user_id, type, amount, currency, description)
            VALUES (?, 'gacha', ?, 'quarks', ?)
        `).run(userId, -cost + totalQuarks, `Gacha x${pullCount}: ${rarityLabels[bestRarity]}`);

        const updated = db.prepare('SELECT quarks, fuel FROM users WHERE id = ?').get(userId);

        res.json({
            results,
            cost,
            pityCounter,
            resources: { quarks: updated.quarks, fuel: updated.fuel },
        });
    });

    // ─── LEADERBOARD (Top explorers) ───
    router.get('/leaderboard', (req, res) => {
        const top = db.prepare(`
            SELECT username, sectors_explored, quarks,
                   RANK() OVER (ORDER BY sectors_explored DESC) as rank
            FROM users
            ORDER BY sectors_explored DESC
            LIMIT 50
        `).all();

        res.json({ leaderboard: top });
    });

    return router;
}

module.exports = createEconomyRouter;
