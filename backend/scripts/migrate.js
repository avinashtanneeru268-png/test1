import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find migration SQL file
const possiblePaths = [
  path.resolve(__dirname, '../../supabase/migrations/20261014000000_create_chat_tables.sql'),
  path.resolve(__dirname, '../supabase_schema.sql'),
  path.resolve(__dirname, '../../backend/supabase_schema.sql')
];

const migrationFilePath = possiblePaths.find(p => fs.existsSync(p));
if (!migrationFilePath) {
  console.error('❌ Could not find migration SQL file.');
  process.exit(1);
}

const sql = fs.readFileSync(migrationFilePath, 'utf8');

function getProjectRef() {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1] : null;
}

async function getConnectionString() {
  // 1. Direct DATABASE_URL in .env
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('[YOUR-PASSWORD]')) {
    return process.env.DATABASE_URL.trim();
  }

  // 2. Command-line argument
  const arg = process.argv[2];
  if (arg && (arg.startsWith('postgres://') || arg.startsWith('postgresql://'))) {
    return arg.trim();
  }

  const projectRef = getProjectRef();
  if (!projectRef) {
    throw new Error('SUPABASE_URL is missing or invalid in backend/.env');
  }

  // 3. Database password from env or CLI arg
  let dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD || arg;

  if (!dbPassword) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    dbPassword = await new Promise((resolve) => {
      console.log('='.repeat(60));
      console.log('⚡ Supabase Automated Database Migration');
      console.log(`📡 Project Reference: ${projectRef}`);
      console.log('='.repeat(60));
      rl.question('\nEnter your Supabase Database Password: ', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }

  if (!dbPassword) {
    throw new Error('Database password is required to run migration.');
  }

  // Direct connection string
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function run() {
  try {
    const connectionString = await getConnectionString();
    console.log('\nConnecting to Supabase PostgreSQL database...');

    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });

    await client.connect();
    console.log('✅ Connected successfully!');
    console.log(`📄 Executing migration: ${path.basename(migrationFilePath)}...`);

    await client.query(sql);

    // Verify created tables
    const checkResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('conversations', 'messages');
    `);

    const createdTables = checkResult.rows.map(r => r.table_name);
    console.log('='.repeat(60));
    console.log('🎉 Migration Executed Successfully!');
    console.log(`📋 Created Tables in Supabase: [${createdTables.join(', ')}]`);
    console.log('🔒 Row-Level Security (RLS) and Indexes applied.');
    console.log('='.repeat(60));

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.error('👉 Hint: Check your database password (set during Supabase project creation).');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('timeout')) {
      console.error('👉 Hint: Check your network connection or verify SUPABASE_URL.');
    }
    process.exit(1);
  }
}

run();
