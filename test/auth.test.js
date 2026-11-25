const assert = require('node:assert/strict');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const authRoutes = require('../routes/auth');
const { createTestApp, startTestServer } = require('../helpers/apiTestServer');

test('sign-in accepts an ID number and returns the safe user profile', async (t) => {
    const passwordHash = await bcrypt.hash('test-password-123', 4);
    const db = {
        async query(sql) {
            assert.match(sql, /WHERE id_number = \? OR username = \?/);
            return [[{
                id: 12,
                username: 'student',
                password: passwordHash,
                role: 'Normal_User',
                is_staff: 0,
                is_active: 1,
            }], []];
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: '2026-0012', password: 'test-password-123' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).user, {
        id: 12,
        username: 'student',
        role: 'Normal_User',
        is_staff: false,
    });
});

test('public signup requires an ID number and cannot self-assign management', async (t) => {
    let insertedValues;
    const db = {
        async query(sql, values) {
            if (sql.startsWith('SELECT id FROM users')) return [[], []];
            if (sql.startsWith('INSERT INTO users')) {
                insertedValues = values;
                return [{ insertId: 20 }, []];
            }
            throw new Error('Unexpected query');
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'new-student',
            id_number: '2026-0020',
            password: 'test-password-123',
            role: 'Management',
        }),
    });

    assert.equal(response.status, 201);
    assert.equal(insertedValues[3], 'Normal_User');
    assert.equal(insertedValues[2], '2026-0020');
});

test('signup rejects missing ID numbers before querying the database', async (t) => {
    const db = { async query() { throw new Error('Database should not be queried'); } };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'no-id', password: 'test-password-123' }),
    });

    assert.equal(response.status, 400);
});
