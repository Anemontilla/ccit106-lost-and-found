const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireLogin, requireManagement } = require('../middleware/auth');

const TABLES = { lost: 'lost_items', found: 'found_items' };
const DATE_COL = { lost_items: 'date_lost', found_items: 'date_found' };
const LOC_COL = { lost_items: 'location_lost', found_items: 'location_found' };
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE },
    fileFilter(req, file, callback) {
        if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
            return callback(new Error('Only JPEG, PNG, GIF or WebP images are allowed'));
        }
        callback(null, true);
    },
});

function handleImageUpload(req, res, next) {
    upload.single('image')(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Image must be 5 MB or smaller' });
        }
        return res.status(400).json({ error: err.message });
    });
}

function actualImageType(buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return 'image/gif';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get('/:type', requireLogin, async (req, res) => {
    const db = req.db;
    const table = TABLES[req.params.type];
    if (!table) return res.status(400).json({ error: 'Invalid item type' });
    try {
        const [rows] = await db.query(
            `SELECT i.item_id, i.name, i.description, i.${DATE_COL[table]} AS item_date,
                    i.${LOC_COL[table]} AS location, i.status, i.reported_by, i.claimed_by,
                    u.username AS claimed_by_username, i.created_at,
                    (i.image_data IS NOT NULL) AS has_image
             FROM ${table} i LEFT JOIN users u ON u.id = i.claimed_by
             ORDER BY i.created_at DESC`
        );
        res.json({ items: rows });
    } catch (err) {
        console.error('[items list]', err.message);
        res.status(500).json({ error: 'Failed to load items' });
    }
});

router.get('/:type/:id/image', requireLogin, async (req, res) => {
    const db = req.db;
    const table = TABLES[req.params.type];
    const id = Number(req.params.id);
    if (!table) return res.status(400).json({ error: 'Invalid item type' });
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid item ID' });
    try {
        const [rows] = await db.query(
            `SELECT image_data, image_mime_type FROM ${table} WHERE item_id = ?`,
            [id]
        );
        const item = rows[0];
        if (!item || !item.image_data) return res.status(404).json({ error: 'Image not found' });
        res.setHeader('Content-Type', item.image_mime_type);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(item.image_data);
    } catch (err) {
        console.error('[item image]', err.message);
        res.status(500).json({ error: 'Failed to load image' });
    }
});

router.post('/:type', requireLogin, handleImageUpload, async (req, res) => {
    const db = req.db;
    const io = req.io;
    const table = TABLES[req.params.type];
    if (!table) return res.status(400).json({ error: 'Invalid item type' });
    const { name, description, date, location } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
        typeof description !== 'string' || !description.trim() ||
        !validDate(date) || typeof location !== 'string' || !location.trim() || location.trim().length > 100) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const imageMimeType = req.file ? actualImageType(req.file.buffer) : null;
    if (req.file && (!imageMimeType || imageMimeType !== req.file.mimetype)) {
        return res.status(400).json({ error: 'The uploaded file is not a valid supported image' });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO ${table}
             (name, description, ${DATE_COL[table]}, ${LOC_COL[table]}, image_data, image_mime_type, reported_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                name.trim(),
                description.trim(),
                date,
                location.trim(),
                req.file ? req.file.buffer : null,
                imageMimeType,
                req.session.user.id,
            ]
        );
        io.emit('item_reported', {
            type: req.params.type, id: result.insertId, name: name.trim(), location: location.trim(), status: 'Open'
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
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid item ID' });
    try {
        const [result] = await db.query(
            `UPDATE ${table} SET status = 'Claimed', claimed_by = ? WHERE item_id = ? AND status = 'Open'`,
            [req.session.user.id, id]
        );
        if (!result.affectedRows) {
            const [rows] = await db.query(`SELECT status FROM ${table} WHERE item_id = ?`, [id]);
            if (!rows.length) return res.status(404).json({ error: 'Item not found' });
            return res.status(409).json({ error: 'Item no longer available to claim' });
        }
        io.emit('item_claimed', { type: req.params.type, id, claimed_by: req.session.user.username });
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
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid item ID' });
    try {
        const [result] = await db.query(
            `UPDATE ${table} SET status = 'Resolved' WHERE item_id = ? AND status = 'Claimed'`,
            [id]
        );
        if (!result.affectedRows) {
            const [rows] = await db.query(`SELECT status FROM ${table} WHERE item_id = ?`, [id]);
            if (!rows.length) return res.status(404).json({ error: 'Item not found' });
            return res.status(409).json({ error: 'Only claimed items can be resolved' });
        }
        io.emit('item_resolved', { type: req.params.type, id });
        res.json({ ok: true });
    } catch (err) {
        console.error('[resolve]', err.message);
        res.status(500).json({ error: 'Resolve failed' });
    }
});

module.exports = router;