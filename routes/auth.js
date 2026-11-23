const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireLogin } = require('../middleware/auth');

router.post('/signup', async (req, res) => {
    const db = req.db;
    const { username, password, id_number, role } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }
    try {
        const [exists] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
        if (exists.length) return res.status(409).json({ error: 'Username already taken' });
        const hash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (username, password, id_number, role) VALUES (?, ?, ?, ?)',
            [username, hash, id_number || null, role || 'Normal_User']
        );
        res.status(201).json({ id: result.insertId, username });
    } catch (err) {
        console.error('[signup]', err.message);
        res.status(500).json({ error: 'Signup failed' });
    }
});

router.post('/login', async (req, res) => {
    const db = req.db;
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }
    try {
        const [rows] = await db.query(
            'SELECT id, username, password, role, is_staff FROM users WHERE username = ?',
            [username]
        );
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            is_staff: !!user.is_staff,
        };
        res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
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