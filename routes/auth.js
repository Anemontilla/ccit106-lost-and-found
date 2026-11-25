const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAdmin, requireLogin } = require('../middleware/auth');

router.post('/signup', async (req, res) => {
    const db = req.db;
    const { username, password, id_number, role } = req.body || {};
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const cleanIdNumber = typeof id_number === 'string' ? id_number.trim() : '';
    const requestedRole = role === undefined ? 'Normal_User' : role;
    if (!cleanUsername || !cleanIdNumber || typeof password !== 'string') {
        return res.status(400).json({ error: 'username, id_number and password are required' });
    }
    if (!['Normal_User', 'Management'].includes(requestedRole)) {
        return res.status(400).json({ error: 'Select a valid account role' });
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
        const approvalRequired = requestedRole === 'Management';
        const [result] = await db.query(
            'INSERT INTO users (username, password, id_number, role, is_active) VALUES (?, ?, ?, ?, ?)',
            [cleanUsername, hash, cleanIdNumber, requestedRole, approvalRequired ? 0 : 1]
        );
        res.status(201).json({
            id: result.insertId,
            username: cleanUsername,
            role: requestedRole,
            approval_required: approvalRequired,
        });
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
        if (Number(user.is_active) !== 1) {
            if (user.role === 'Management' && Number(user.is_staff) !== 1) {
                return res.status(403).json({ error: 'Management access is awaiting administrator approval' });
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }
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

router.get('/management-requests', requireAdmin, async (req, res) => {
    try {
        const [requests] = await req.db.query(
            `SELECT id, username, id_number, created_at
             FROM users
             WHERE role = 'Management' AND is_active = 0 AND is_staff = 0
             ORDER BY created_at ASC`
        );
        res.json({ requests });
    } catch (err) {
        console.error('[management requests]', err.message);
        res.status(500).json({ error: 'Failed to load management requests' });
    }
});

router.post('/management-requests/:id/approve', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid management request ID' });
    }
    try {
        const [result] = await req.db.query(
            `UPDATE users SET is_active = 1
             WHERE id = ? AND role = 'Management' AND is_active = 0 AND is_staff = 0`,
            [id]
        );
        if (!result.affectedRows) {
            return res.status(409).json({ error: 'Management request is no longer pending' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('[management approval]', err.message);
        res.status(500).json({ error: 'Failed to approve management request' });
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