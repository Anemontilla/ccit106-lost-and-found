require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const mysql = require('mysql2/promise');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const searchRoutes = require('./routes/search');
const claimRoutes = require('./routes/claims');
const { requireLogin, requireManagement } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// 1b. Render fronts our app with a reverse proxy/load balancer
app.set('trust proxy', 1);

// Socket.io for real-time notifications
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
    },
});
app.set('io', io);

// 1e. MySQL pool: TLS enabled in production, connectionLimit 5
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'lost_and_found',
    connectionLimit: 5,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
});

pool.getConnection()
    .then((conn) => {
        console.log('[db] connected to MySQL');
        conn.release();
    })
    .catch((err) => {
        console.error('[db] connection failed:', err.message);
    });

// 1c. Database-backed session store (survives redeploys/restarts)
const sessionStore = new MySQLStore(
    {
        createTableIfNotExists: true,
        schema: {
            tableName: 'sessions',
            columnNames: {
                session_id: 'session_id',
                expires: 'expires',
                data: 'data',
            },
        },
    },
    pool
);

// 1b + 1c. Session configuration
app.use(
    session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET,
        name: 'sid',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 24 * 7,
        },
    })
);

// ── Middleware ────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
    })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Expose db + io to route handlers
app.use((req, res, next) => {
    req.db = pool;
    req.io = io;
    next();
});

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/claims', claimRoutes);

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, db: true });
    } catch (err) {
        res.status(503).json({ ok: false, db: false, error: err.message });
    }
});

// ── Socket lifecycle ──────────────────────────────────────
io.on('connection', (socket) => {
    console.log('[socket] connected:', socket.id);
    socket.on('disconnect', () => console.log('[socket] disconnected:', socket.id));
});

// ── Start ─────────────────────────────────────────────────
// 1a. Port from process.env.PORT (Render sets PORT automatically)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`NODE_ENV=${process.env.NODE_ENV}`);
});