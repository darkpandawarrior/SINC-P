-- Password reset tokens. Additive to drizzle/0001_rls.sql: schema.ts is frozen (see
-- docs/decisions/0001-product-and-architecture.md), so drizzle-kit push never sees this
-- table and it is created here directly instead, following the same hand-written-SQL
-- pattern 0001_rls.sql already uses for RLS. See src/db/schema.auth.ts for the Drizzle
-- side of this table.
--
-- Run AFTER 0001_rls.sql: the policy below calls app_current_institution() and
-- app_rls_bypassed(), both defined there. Idempotent, same as 0001.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_uq ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- Explicit grants rather than relying on 0001_rls.sql's ALTER DEFAULT PRIVILEGES (which
-- would only cover this table automatically if this file always runs after it, for
-- objects created by the same role) — belt and braces, same reasoning as everywhere else
-- RLS is involved in this repo.
GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO sincp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO sincp_admin;

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS password_reset_tokens_tenant_isolation ON password_reset_tokens;
CREATE POLICY password_reset_tokens_tenant_isolation ON password_reset_tokens
  USING (institution_id = app_current_institution() OR app_rls_bypassed())
  WITH CHECK (institution_id = app_current_institution() OR app_rls_bypassed());
