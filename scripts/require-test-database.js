// CI must exercise the real PostgreSQL transaction/concurrency test, never silently skip it.
if (!process.env.TEST_DATABASE_URL) throw new Error('CI requires a dedicated TEST_DATABASE_URL');
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error('Use a separate test database');
