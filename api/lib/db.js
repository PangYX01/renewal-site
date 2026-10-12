import postgres from 'postgres';
let client;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!client) client = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, idle_timeout: 20 });
  return client;
}
