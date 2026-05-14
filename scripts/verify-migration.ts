import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from '../src/db/schema'

const url = process.env.DATABASE_URL_EU
if (!url) throw new Error('DATABASE_URL_EU not set')
const sql = neon(url)
const db = drizzle(sql, { schema })

async function verify() {
  const tables = ['users', 'entities', 'invoices', 'bills', 'journal_entries', 'contacts', 'bank_accounts', 'audit_log']
  for (const t of tables) {
    const result = await sql`SELECT COUNT(*) FROM ${sql(t)}`
    console.log(`${t}: ${result[0].count} rows`)
  }
  console.log('✅ Verification complete')
}
verify().catch(console.error)
