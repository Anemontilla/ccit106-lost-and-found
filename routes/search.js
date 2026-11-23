const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, async (req, res) => {
    const db = req.db;
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: { lost: [], found: [] } });
    const like = `%${q}%`;
    try {
        const [lost] = await db.query(
            `SELECT item_id, name, location_lost AS location, status FROM lost_items
             WHERE (name LIKE ? OR description LIKE ? OR location_lost LIKE ?)
             AND status != 'Resolved' ORDER BY created_at DESC LIMIT 5`,
            [like, like, like]
        );
        const [found] = await db.query(
            `SELECT item_id, name, location_found AS location, status FROM found_items
             WHERE (name LIKE ? OR description LIKE ? OR location_found LIKE ?)
             AND status != 'Resolved' ORDER BY created_at DESC LIMIT 5`,
            [like, like, like]
        );
        res.json({ results: { lost, found } });
    } catch (err) {
        console.error('[search]', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;