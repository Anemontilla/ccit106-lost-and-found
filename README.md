# CSPC Lost & Found

The deployed application is Node.js, Express and MySQL. The Django project under `lost-and-found-v2` is kept as a design and behavior reference; it is not part of the production runtime and its PostgreSQL migrations must not be run against Aiven.

## Local setup

1. Install Node.js 18 or later and run `npm install`.
2. Configure the environment variables from `.env.example`.
3. For a new MySQL database, execute `schema.sql` as a database administrator. For the existing Aiven database, execute `db/migrations/001_add_user_status_and_item_images.sql` once as an administrator. The migration preserves existing rows and image paths.
4. Start the server with `npm start`; use `npm run dev` during development.

The Express application account needs `SELECT`, `INSERT`, `UPDATE` and `DELETE` access to the application tables. The `sessions` table must also exist for database-backed sessions.

## Demo account

Set `DEMO_USERNAME`, `DEMO_ID_NUMBER` and `DEMO_PASSWORD` in the environment, optionally set `DEMO_ROLE` to `Management` or `Normal_User`, then run `npm run seed:demo`. The seeder refuses to change an existing user and reads credentials only from environment variables. Normal demo accounts are active; Management demo accounts are created as pending requests and must be approved. Public signup follows the same approval rule for Management accounts.

Users sign in with their ID number; the login field also accepts a username for compatibility with existing Express accounts. New signups require an ID number.

## Roles and management approval

Public signup offers Normal user and Management. Management requests are created inactive and cannot sign in until an administrator approves them from the Management dashboard. Administrator access is represented by `is_staff = 1`; selecting Management at signup never grants administrator privileges.

To bootstrap the first administrator, create an account through signup, then run this as a database administrator in Aiven's SQL console, replacing the username:

```sql
UPDATE users
SET role = 'Management', is_staff = 1, is_active = 1
WHERE username = 'your-admin-username';
```

Verify the update affected the intended account before signing in. The account password is already stored as a bcrypt hash by signup; do not put plaintext passwords in SQL.

## Item images

Uploads are limited to 5 MB and validated as JPEG, PNG, GIF or WebP. Image bytes and MIME types are stored in Aiven MySQL `MEDIUMBLOB` columns; the existing `image` path columns are retained for compatibility. Because the database stores the image bytes, no Render filesystem persistence is required.

## Render

Use the Node runtime and `npm start`. Configure the database and session environment variables in Render. No Python runtime, Django package install, or Django migration step is required.

## Checks

Run the focused Node tests with `npm test`.
