// Authentication routes — register, login, profile.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

function createAuthRouter(db) {
    const router = express.Router();

    // POST /api/auth/register
    router.post('/register', async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username y password son requeridos' });
        }
        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({ error: 'Username debe tener entre 3 y 32 caracteres' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password debe tener al menos 6 caracteres' });
        }

        // Check if user exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(409).json({ error: 'Username ya registrado' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Insert user
        const result = db.prepare(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)'
        ).run(username, passwordHash);

        const token = jwt.sign(
            { userId: result.lastInsertRowid, username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Explorador registrado exitosamente',
            token,
            user: {
                id: result.lastInsertRowid,
                username,
                quarks: 500,
                fuel: 20,
            },
        });
    });

    // POST /api/auth/login
    router.post('/login', async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username y password son requeridos' });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Update last login
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Bienvenido de vuelta, Explorador',
            token,
            user: {
                id: user.id,
                username: user.username,
                quarks: user.quarks,
                fuel: user.fuel,
                sectors_explored: user.sectors_explored,
            },
        });
    });

    // GET /api/auth/profile
    router.get('/profile', authMiddleware, (req, res) => {
        const user = db.prepare(
            'SELECT id, username, quarks, fuel, sectors_explored, created_at FROM users WHERE id = ?'
        ).get(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ user });
    });

    return router;
}

module.exports = createAuthRouter;
