const express = require('express');
const router = express.Router();
const { requireLogin, requireManagement } = require('../middleware/auth');

router.post('/', requireLogin, async (req, res) => {
    const db = req.db;
    const io = req.io;
    const { item_type, item_id, reason } = req.body || {};
    if (!item_type || !item_id || !reason) return res.status(400).json({ error: 'All fields required' });
    if (!['lost', 'found'].includes(item_type)) return res.status(400).json({ error: 'Invalid item type' });
    const table = item_type === 'lost' ? 'lost_items' : 'found_items';
    try {
        const [rows] = await db.query(`SELECT status FROM ${table} WHERE item_id = ?`, [item_id]);
        const item = rows[0];
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.status !== 'Open') return res.status(409).json({ error: 'Item no longer available' });
        const [existing] = await db.query(
            'SELECT id FROM claim_requests WHERE item_type = ? AND item_id = ? AND requester = ? AND status = "Pending"',
            [item_type, item_id, req.session.user.id]
        );
        if (existing.length) return res.status(409).json({ error: 'You already have a pending request for this item' });
        const [result] = await db.query(
            'INSERT INTO claim_requests (item_type, item_id, requester, reason) VALUES (?, ?, ?, ?)',
            [item_type, item_id, req.session.user.id, reason]
        );
        io.emit('claim_requested', { item_type, item_id, requester: req.session.user.username });
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error('[claims create]', err.message);
        res.status(500).json({ error: 'Failed to submit claim' });
    }
});

router.get('/', requireManagement, async (req, res) => {
    const db = req.db;
    const [pending] = await db.query(
        `SELECT cr.id, cr.item_type, cr.item_id, cr.reason, cr.status, cr.created_at, u.username AS requester
         FROM claim_requests cr JOIN users u ON u.id = cr.requester
         WHERE cr.status = 'Pending' ORDER BY cr.created_at DESC`
    );
    const [history] = await db.query(
        `SELECT cr.id, cr.item_type, cr.item_id, cr.reason, cr.status, cr.created_at, u.username AS requester
         FROM claim_requests cr JOIN users u ON u.id = cr.requester
         WHERE cr.status != 'Pending' ORDER BY cr.created_at DESC LIMIT 20`
    );
    res.json({ pending, history });
});

router.post('/:id/:action', requireManagement, async (req, res) => {
    const db = req.db;
    const io = req.io;
    const { id, action } = req.params;
    const { note } = req.body || {};
    if (!['approve', 'decline'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    const [rows] = await db.query('SELECT * FROM claim_requests WHERE id = ?', [id]);
    const cr = rows[0];
    if (!cr) return res.status(404).json({ error: 'Request not found' });
    if (cr.status !== 'Pending') return res.status(409).json({ error: 'Already processed' });
    const table = cr.item_type === 'lost' ? 'lost_items' : 'found_items';
    await db.query('START TRANSACTION');
    try {
        await db.query(
            'UPDATE claim_requests SET status = ?, manager_note = ? WHERE id = ?',
            [action === 'approve' ? 'Approved' : 'Declined', note || null, id]
        );
        if (action === 'approve') {
            await db.query(`UPDATE ${table} SET status = 'Claimed', claimed_by = ? WHERE item_id = ?`, [cr.requester, cr.item_id]);
            await db.query(
                `UPDATE claim_requests SET status = 'Declined', manager_note = 'Item was claimed by another user.'
                 WHERE item_type = ? AND item_id = ? AND status = 'Pending' AND id != ?`,
                [cr.item_type, cr.item_id, id]
            );
            const [users] = await db.query('SELECT username FROM users WHERE id = ?', [cr.requester]);
            io.emit('claim_approved', { user: users[0].username });
        } else {
            io.emit('claim_declined', { item_type: cr.item_type, item_id: cr.item_id });
        }
        await db.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await db.query('ROLLBACK');
        throw err;
    }
});

module.exports = router;