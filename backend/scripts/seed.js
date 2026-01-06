const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Try to load .env manually since dotenv might not be installed
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.log('Could not load .env file', e);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  try {
    const seedPath = path.join(__dirname, '..', '..', 'database', 'seed.sql');
    console.log(`Reading seed data from ${seedPath}`);
    if (!fs.existsSync(seedPath)) {
        throw new Error(`Seed file not found at ${seedPath}`);
    }
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    
    console.log('Executing seed...');
    await pool.query(seedSql);
    console.log('Seed completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
