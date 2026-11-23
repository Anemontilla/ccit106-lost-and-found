const express = require('express');
const router = express.Router();
const { requireLogin, requireManagement } = require('../middleware/auth');

const TABLES = { lost: 'lost_items', found: 'found_items' };
const DATE_COL = { lost_items: 'date_lost', found_items: 'date_found' };
const LOC_COL = { lost_items: 'location_lost', found_items: 'location_found' };

router.get('/:type', requireLogin, async (req, res) => {
    const db = req.db;
    const table = TABLES[req.params.type];
    if (!table) return res.status(400).json({ error: 'Invalid item type' });
    try {
        const [rows] = await db.query(
            `SELECT item_id, name, description, ${DATE_COL[table]} AS item_date,
                    ${LOC_COL[table]} AS location, status, reported_by, claimed_by, created_at
             FROM ${table} WHERE status != 'Resolved' ORDER BY created_at DESC`
        );
        res.json({ items: rows });
    } catch (err) {
        console.error('[items list]', err.message);
        res.status(500).json({ error: 'Failed to load items' });
    }
});

router.post('/:type', requireManagement, async (req, res) => {
    const db = req.db;
    const io = req.io;
    const table = TABLES[req.params.type];
    if (!table) return res.status(400).json({ error: 'Invalid item type' });
    const { name, description, date, location } = req.body || {};
    if (!name || !description || !date || !location) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    try {
        const [result] = await db.query(
            `INSERT INTO ${table} (name, description, ${DATE_COL[table]}, ${LOC_COL[table]}, reported_by)
             VALUES (?, ?, ?, ?, ?)`,
            [name, description, date, location, req.session.user.id]
        );
        io.emit('item_reported', {
            type: req.params.type, id: result.insertId, name, location, status: 'Open'
        });
        res.status(201).json({ item_id: result.insertId, message: 'Item reported' });
    } catch (err) {
        console.error('[items create]', err.message);
        res.status(500).json({ error: 'Failed to report item' });
    }
});

router.post('/:type/:id/claim', requireLogin, async (req, res) => {
    const db = req.db;
    const io = req.io;
    const table = TABLES[req.params.type];
    if (!table) return res.status(400).json({ error: 'Invalid item type' });
    try {
        const [rows] = await db.query(`SELECT status FROM ${table} WHERE item_id = ?`, [req.params.id]);
        const item = rows[0];
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.status !== 'Open') return res.status(409).json({ error: 'Item no longer available' });
        await db.query(
            `UPDATE ${table} SET status = 'Claimed', claimed_by = ? WHERE item_id = ?`,
            [req.session.user.id, req.params.id]
        );
        io.emit('item_claimed', { type: req.params.type, id: req.params.id, claimed_by: req.session.user.username });
        res.json({ ok: true });
    } catch (err) {
        console.error('[claim]', err.message);
        res.status(500).json({ error: 'Claim failed' });
    }
});

router.post('/:type/:id/resolve', requireManagement, async (req, res) => {
    const db = req.db;
    const io = req.io;
    const table = TABLES[req.params.type];
    if (!table) return res.status(400).json({ error: 'Invalid item type' });
    try {
        const [rows] = await db.query(`SELECT status FROM ${table} WHERE item_id = ?`, [req.params.id]);
        const item = rows[0];
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.status === 'Resolved') return res.status(409).json({ error: 'Item already resolved' });
        await db.query(`UPDATE ${table} SET status = 'Resolved' WHERE item_id = ?`, [req.params.id]);
        io.emit('item_resolved', { type: req.params.type, id: req.params.id });
        res.json({ ok: true });
    } catch (err) {
        console.error('[resolve]', err.message);
        res.status(500).json({ error: 'Resolve failed' });
    }
});

module.exports = router;