require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
    const username = process.env.DEMO_USERNAME;
    const idNumber = process.env.DEMO_ID_NUMBER;
    const password = process.env.DEMO_PASSWORD;
    const role = process.env.DEMO_ROLE || 'Normal_User';

    if (!username || !idNumber || !password) {
        throw new Error('Set DEMO_USERNAME, DEMO_ID_NUMBER and DEMO_PASSWORD before seeding.');
    }
    if (!['Management', 'Normal_User'].includes(role)) {
        throw new Error('DEMO_ROLE must be Management or Normal_User.');
    }
    if (username.length > 150 || idNumber.length > 20 || password.length < 8) {
        throw new Error('Demo username, ID number or password does not meet the length requirements.');
    }

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'lost_and_found',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    try {
        const [existing] = await connection.query(
            'SELECT id FROM users WHERE username = ? OR id_number = ? LIMIT 1',
            [username, idNumber]
        );
        if (existing.length) {
            console.log('A user with that username or ID already exists; no account was changed.');
            return;
        }

        const hash = await bcrypt.hash(password, 10);
        await connection.query(
            'INSERT INTO users (username, password, id_number, role) VALUES (?, ?, ?, ?)',
            [username, hash, idNumber, role]
        );
        console.log(`Created the ${role} demo account for ${username}.`);
    } finally {
        await connection.end();
    }
}

main().catch((err) => {
    console.error('[seed-demo]', err.message);
    process.exitCode = 1;
});
