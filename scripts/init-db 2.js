/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('pg');

// Force IPv4 resolution by using the direct connection string if possible or relying on pg's handling
const connectionString = 'postgresql://postgres:lopmaker199171@db.tjbnrarawwbhfbjqvpsh.supabase.co:5432/postgres?sslmode=require';

async function initDb() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false } // Required for Supabase in some environments
    });

    try {
        console.log('Connecting to database...');
        await client.connect();

        // Create Orders Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        vpo_number TEXT NOT NULL,
        customer_name TEXT,
        supplier_name TEXT,
        order_date TEXT,
        total_amount DECIMAL(10, 2),
        status TEXT DEFAULT 'Confirmed',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
        console.log('Orders table created.');

        // Create Order Items Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_code TEXT,
        description TEXT,
        quantity INTEGER,
        unit_price DECIMAL(10, 2),
        total DECIMAL(10, 2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
        console.log('Order Items table created.');

        console.log('Database initialization complete!');
    } catch (error) {
        console.error('Error initializing database:', error);
    } finally {
        await client.end();
    }
}

initDb();
