const express = require('express');

function createTestApp(router, db, prefix) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.db = db;
        req.io = { emit() {} };
        req.session = {};
        const role = req.get('x-test-role');
        if (role) {
            req.session.user = {
                id: Number(req.get('x-test-user-id') || 7),
                username: 'test-user',
                role,
                is_staff: req.get('x-test-staff') === '1',
            };
        }
        next();
    });
    app.use(prefix, router);
    return app;
}

async function startTestServer(t, app) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    t.after(() => new Promise((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
    }));
    return 'http://127.0.0.1:' + server.address().port;
}

module.exports = { createTestApp, startTestServer };
