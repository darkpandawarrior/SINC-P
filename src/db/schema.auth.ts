/**
 * Password reset tokens.
 *
 * Kept out of schema.ts on purpose: that file is frozen (see the ADR and the top-level
 * build spec) and drizzle.config.ts diffs `drizzle-kit push` against it alone, so a table
 * added here would never get created by push. This table is instead created directly by
 * drizzle/0002_password_reset_tokens.sql, hand-written the same way 0001_rls.sql already
 * is. Drizzle's query builder does not require a table to belong to the `schema` bundle
 * passed to `drizzle()` — only the relational `db.query.*` API needs that, and nothing
 * in this codebase uses it — so `tx.insert(passwordResetTokens)...` works against the
 * same `Tx`/`Db` types client.ts exports without touching client.ts.
 */
import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { institutions, users } from './schema'

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the raw 32-byte token. The raw token exists only in the URL the user
     *  clicked (never stored) — a database dump must not be enough to reset an account. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set on first use *or* when a later reset/password-change invalidates it. Null
     *  means "still live". */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('password_reset_tokens_hash_uq').on(t.tokenHash),
    index('password_reset_tokens_user_idx').on(t.userId),
  ],
)

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect
