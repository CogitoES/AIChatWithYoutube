import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

async function testConnection() {
  const connectionString = 'postgresql://neondb_owner:npg_u9kFheMisK6J@ep-misty-fog-ag31ohg1-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
  
  console.log('Connecting to Neon...');
  const sql = neon(connectionString);
  
  try {
    const result = await sql`SELECT version(), now();`;
    console.log('Connection successful!');
    console.log('Postgres Version:', result[0].version);
    console.log('Current Time:', result[0].now);
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

testConnection();
