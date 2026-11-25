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

test('management signup creates a pending request and cannot self-assign staff', async (t) => {
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
            is_staff: true,
        }),
    });

    assert.equal(response.status, 201);
    assert.equal(insertedValues[3], 'Management');
    assert.equal(insertedValues[2], '2026-0020');
    assert.equal(insertedValues[4], 0);
    assert.equal(insertedValues.length, 5);
    assert.deepEqual(await response.json(), {
        id: 20,
        username: 'new-student',
        role: 'Management',
        approval_required: true,
    });
});

test('normal signup creates an active account', async (t) => {
    let insertedValues;
    const db = {
        async query(sql, values) {
            if (sql.startsWith('SELECT id FROM users')) return [[], []];
            if (sql.startsWith('INSERT INTO users')) {
                insertedValues = values;
                return [{ insertId: 21 }, []];
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
            id_number: '2026-0021',
            password: 'test-password-123',
        }),
    });

    assert.equal(response.status, 201);
    assert.equal(insertedValues[3], 'Normal_User');
    assert.equal(insertedValues[4], 1);
    assert.equal((await response.json()).approval_required, false);
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

test('signup rejects roles other than normal user or management', async (t) => {
    const db = { async query() { throw new Error('Database should not be queried'); } };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'admin-attempt',
            id_number: '2026-0024',
            password: 'test-password-123',
            role: 'Administrator',
        }),
    });

    assert.equal(response.status, 400);
});

test('pending management accounts cannot sign in', async (t) => {
    const db = {
        async query() {
            return [[{
                id: 22,
                username: 'pending-manager',
                password: 'unused-hash',
                role: 'Management',
                is_staff: 0,
                is_active: 0,
            }], []];
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'pending-manager', password: 'test-password-123' }),
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'Management access is awaiting administrator approval');
});

test('only administrators can read management requests', async (t) => {
    let queried = false;
    const db = {
        async query() {
            queried = true;
            return [[], []];
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/management-requests', {
        headers: { 'x-test-role': 'Management' },
    });

    assert.equal(response.status, 403);
    assert.equal(queried, false);
});

test('administrators can read pending management requests without password fields', async (t) => {
    const expectedRequests = [{
        id: 24,
        username: 'manager-request',
        id_number: '2026-0024',
        created_at: '2026-11-25 12:00:00',
    }];
    const db = {
        async query(sql) {
            assert.match(sql, /role = 'Management' AND is_active = 0 AND is_staff = 0/);
            assert.match(sql, /SELECT id, username, id_number, created_at/);
            return [expectedRequests, []];
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/management-requests', {
        headers: { 'x-test-role': 'Normal_User', 'x-test-staff': '1' },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { requests: expectedRequests });
});

test('administrators can approve pending management requests', async (t) => {
    const db = {
        async query(sql, values) {
            assert.match(sql, /UPDATE users SET is_active = 1/);
            assert.match(sql, /role = 'Management' AND is_active = 0 AND is_staff = 0/);
            assert.deepEqual(values, [23]);
            return [{ affectedRows: 1 }, []];
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(authRoutes, db, '/api/auth'));
    const response = await fetch(baseUrl + '/api/auth/management-requests/23/approve', {
        method: 'POST',
        headers: { 'x-test-role': 'Normal_User', 'x-test-staff': '1' },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
});
