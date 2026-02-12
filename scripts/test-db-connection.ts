
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

// Load env vars BEFORE importing db
dotenv.config({ path: '.env.local' });

async function testConnection() {
    try {
        // Dynamic import ensures process.env.DATABASE_URL is set
        const { db } = await import('@/db');

        console.log('Testing database connection...');
        const result = await db.execute(sql`SELECT NOW()`);
        console.log('Connection successful:', result);
        process.exit(0);
    } catch (error) {
        console.error('Connection failed:', error);
        process.exit(1);
    }
}

testConnection();
