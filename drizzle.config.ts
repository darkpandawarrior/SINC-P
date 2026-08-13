import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Migrations need the owner, not the runtime role. Reading DATABASE_URL first meant
    // that with a normal .env.local (which points at the restricted sincp_app) a push
    // silently did nothing useful: no permission to create a table, and no obvious error
    // until something later failed with "relation does not exist".
    url:
      process.env.DATABASE_MIGRATION_URL ??
      process.env.DATABASE_URL ??
      'postgres://sincp:sincp@localhost:5432/sincp',
  },
} satisfies Config
