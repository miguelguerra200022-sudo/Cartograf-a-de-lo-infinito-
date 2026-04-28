// JWT authentication middleware.
// Verifies Bearer tokens and attaches user to request.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cartografia_infinito_secret_2026';

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

module.exports = { authMiddleware, JWT_SECRET };
