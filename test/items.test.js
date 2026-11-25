const assert = require('node:assert/strict');
const { test } = require('node:test');
const itemRoutes = require('../routes/items');
const { createTestApp, startTestServer } = require('../helpers/apiTestServer');

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function reportForm(image) {
    const form = new FormData();
    form.append('name', 'Campus wallet');
    form.append('description', 'Small blue wallet');
    form.append('date', '2026-11-25');
    form.append('location', 'Library');
    if (image) form.append('image', image, 'wallet.png');
    return form;
}

test('normal users can report an item and store a validated image in MySQL', async (t) => {
    let insertValues;
    const db = {
        async query(sql, values) {
            assert.match(sql, /INSERT INTO lost_items/);
            insertValues = values;
            return [{ insertId: 31 }, []];
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(itemRoutes, db, '/api/items'));
    const form = reportForm(new Blob([png], { type: 'image/png' }));
    const response = await fetch(baseUrl + '/api/items/lost', {
        method: 'POST',
        headers: { 'x-test-role': 'Normal_User' },
        body: form,
    });

    assert.equal(response.status, 201);
    assert.equal(insertValues[0], 'Campus wallet');
    assert.deepEqual(insertValues[4], png);
    assert.equal(insertValues[5], 'image/png');
    assert.equal(insertValues[6], 7);
});

test('item image uploads reject content that does not match the declared image type', async (t) => {
    let queried = false;
    const db = { async query() { queried = true; throw new Error('Unexpected database query'); } };
    const baseUrl = await startTestServer(t, createTestApp(itemRoutes, db, '/api/items'));
    const form = reportForm(new Blob(['not a png'], { type: 'image/png' }));
    const response = await fetch(baseUrl + '/api/items/lost', {
        method: 'POST',
        headers: { 'x-test-role': 'Normal_User' },
        body: form,
    });

    assert.equal(response.status, 400);
    assert.equal(queried, false);
});

test('item image uploads larger than 5 MB are rejected before reaching MySQL', async (t) => {
    let queried = false;
    const db = { async query() { queried = true; throw new Error('Unexpected database query'); } };
    const baseUrl = await startTestServer(t, createTestApp(itemRoutes, db, '/api/items'));
    const oversizedImage = new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' });
    const response = await fetch(baseUrl + '/api/items/lost', {
        method: 'POST',
        headers: { 'x-test-role': 'Normal_User' },
        body: reportForm(oversizedImage),
    });

    assert.equal(response.status, 413);
    assert.equal(queried, false);
});

test('image retrieval returns the stored bytes and MIME type', async (t) => {
    const db = {
        async query(sql) {
            assert.match(sql, /SELECT image_data, image_mime_type FROM lost_items/);
            return [[{ image_data: png, image_mime_type: 'image/png' }], []];
        },
    };
    const baseUrl = await startTestServer(t, createTestApp(itemRoutes, db, '/api/items'));
    const response = await fetch(baseUrl + '/api/items/lost/31/image', {
        headers: { 'x-test-role': 'Normal_User' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});

test('normal users cannot resolve claimed items', async (t) => {
    const db = { async query() { throw new Error('Access should be denied before querying'); } };
    const baseUrl = await startTestServer(t, createTestApp(itemRoutes, db, '/api/items'));
    const response = await fetch(baseUrl + '/api/items/lost/31/resolve', {
        method: 'POST',
        headers: { 'x-test-role': 'Normal_User' },
    });

    assert.equal(response.status, 403);
});
