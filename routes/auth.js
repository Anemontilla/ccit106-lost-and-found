const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireLogin } = require('../middleware/auth');

router.post('/signup', async (req, res) => {
    const db = req.db;
    const { username, password, id_number, role } = req.body || {};
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const cleanIdNumber = typeof id_number === 'string' ? id_number.trim() : '';
    if (!cleanUsername || !cleanIdNumber || typeof password !== 'string') {
        return res.status(400).json({ error: 'username, id_number and password are required' });
    }
    if (cleanUsername.length > 150 || cleanIdNumber.length > 20 || password.length < 8) {
        return res.status(400).json({ error: 'Check the username, ID number and password length' });
    }

    try {
        const [exists] = await db.query(
            'SELECT id FROM users WHERE username = ? OR id_number = ? LIMIT 1',
            [cleanUsername, cleanIdNumber]
        );
        if (exists.length) return res.status(409).json({ error: 'Username or ID number already taken' });
        const hash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (username, password, id_number, role) VALUES (?, ?, ?, ?)',
            [cleanUsername, hash, cleanIdNumber, 'Normal_User']
        );
        res.status(201).json({ id: result.insertId, username: cleanUsername });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username or ID number already taken' });
        }
        console.error('[signup]', err.message);
        res.status(500).json({ error: 'Signup failed' });
    }
});

router.post('/login', async (req, res) => {
    const db = req.db;
    const { identifier, password } = req.body || {};
    if (typeof identifier !== 'string' || !identifier.trim() || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'ID number and password are required' });
    }
    try {
        const [rows] = await db.query(
            `SELECT id, username, password, role, is_staff, is_active FROM users
             WHERE id_number = ? OR username = ?
             ORDER BY (id_number = ?) DESC LIMIT 1`,
            [identifier.trim(), identifier.trim(), identifier.trim()]
        );
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (!user.is_active) return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            is_staff: Number(user.is_staff) === 1,
        };
        res.json({
            ok: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                is_staff: Number(user.is_staff) === 1,
            },
        });
    } catch (err) {
        console.error('[login]', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/logout', requireLogin, (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.clearCookie('sid');
        res.json({ ok: true });
    });
});

router.get('/me', requireLogin, (req, res) => {
    res.json({ user: req.session.user });
});

module.exports = router;