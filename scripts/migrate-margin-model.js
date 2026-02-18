/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.resolve(process.cwd(), '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^DATABASE_URL=(?:"([^"]+)"|(.+))$/m);
  if (!match) {
    throw new Error('DATABASE_URL not found in .env.local');
  }
  return (match[1] || match[2]).trim();
}

async function run() {
  const connectionString = loadDatabaseUrl();
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tariff_rates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_class TEXT NOT NULL UNIQUE,
        tariff_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_margin NUMERIC(12,2);`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_margin_rate NUMERIC(7,4);`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'PO_UPLOADED';`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_term_days INTEGER DEFAULT 30;`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_term_days INTEGER DEFAULT 30;`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS logistics_term_days INTEGER DEFAULT 15;`);

    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_unit_price NUMERIC(10,2);`);
    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_unit_price NUMERIC(10,2);`);
    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tariff_rate NUMERIC(7,4);`);
    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS estimated_duty_cost NUMERIC(12,2);`);
    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS estimated_3pl_cost NUMERIC(12,2);`);
    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS estimated_margin NUMERIC(12,2);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS containers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        container_no TEXT NOT NULL UNIQUE,
        vessel_name TEXT,
        status TEXT DEFAULT 'PLANNED',
        etd TIMESTAMPTZ,
        atd TIMESTAMPTZ,
        eta TIMESTAMPTZ,
        ata TIMESTAMPTZ,
        arrival_at_warehouse TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS container_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
        allocated_qty INTEGER,
        allocated_amount NUMERIC(12,2),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shipping_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        doc_no TEXT NOT NULL UNIQUE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        container_id UUID REFERENCES containers(id) ON DELETE SET NULL,
        issue_date TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'DRAFT',
        payload TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS commercial_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_no TEXT NOT NULL UNIQUE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        container_id UUID REFERENCES containers(id) ON DELETE SET NULL,
        issue_date TIMESTAMPTZ DEFAULT NOW(),
        due_date TIMESTAMPTZ,
        currency TEXT DEFAULT 'USD',
        amount NUMERIC(12,2) NOT NULL,
        status TEXT DEFAULT 'OPEN',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bill_no TEXT NOT NULL UNIQUE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        issue_date TIMESTAMPTZ DEFAULT NOW(),
        due_date TIMESTAMPTZ,
        currency TEXT DEFAULT 'USD',
        amount NUMERIC(12,2) NOT NULL,
        status TEXT DEFAULT 'OPEN',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS logistics_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bill_no TEXT NOT NULL UNIQUE,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        container_id UUID REFERENCES containers(id) ON DELETE SET NULL,
        provider TEXT,
        issue_date TIMESTAMPTZ DEFAULT NOW(),
        due_date TIMESTAMPTZ,
        currency TEXT DEFAULT 'USD',
        amount NUMERIC(12,2) NOT NULL,
        status TEXT DEFAULT 'OPEN',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type TEXT NOT NULL,
        target_id UUID NOT NULL,
        direction TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        payment_date TIMESTAMPTZ DEFAULT NOW(),
        method TEXT,
        reference_no TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      UPDATE order_items
      SET customer_unit_price = COALESCE(customer_unit_price, unit_price)
      WHERE customer_unit_price IS NULL;
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
