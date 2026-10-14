# Isolated workflow regression test

Requires Node 22.18+ and available localhost port 55432. Run `npm install` then `npm test` in this directory. Uses an in-memory PostgreSQL engine and the production postgres.js driver; never connects to Supabase or writes production data. Covers authentication, stock, billing, retries, reporting, cancellation, and logout. This does not substitute for real-device UI or multi-user load testing.
