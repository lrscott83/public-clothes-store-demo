-- Users / Roles / Autenticación (SDD change backend-users-roles).
--
-- Ordered in 5 steps (design.md §3 — THE migration, top risk):
--   1. Create the four new tables (app_user, refresh_token,
--      password_reset_token, warehouse_operator). No dependency on
--      `customer` yet.
--   2. Add `customer.user_id` as NULLABLE — existing rows transiently have
--      user_id = NULL.
--   3. Mint one `app_user` per existing customer AND link it, in a single
--      correlated statement, so every customer ends up with a unique user.
--   4. Enforce NOT NULL on `customer.user_id` — safe now, every row was
--      backfilled in step 3.
--   5. Add the 1:1 unique index + FK.
--
-- On a fresh DB (no customer rows), steps 1/2/4/5 run as correct no-ops on
-- empty data and step 3's CTE affects zero rows.

-- Step 1: CreateTable app_user
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "cell_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "roles" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- Step 1: CreateIndex app_user.login
CREATE UNIQUE INDEX "app_user_login_key" ON "app_user"("login");

-- Step 1: CreateTable refresh_token
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- Step 1: CreateIndex refresh_token
CREATE UNIQUE INDEX "refresh_token_token_key" ON "refresh_token"("token");
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- Step 1: CreateTable password_reset_token
CREATE TABLE "password_reset_token" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- Step 1: CreateIndex password_reset_token
CREATE UNIQUE INDEX "password_reset_token_token_key" ON "password_reset_token"("token");
CREATE INDEX "password_reset_token_user_id_idx" ON "password_reset_token"("user_id");

-- Step 1: CreateTable warehouse_operator
CREATE TABLE "warehouse_operator" (
    "user_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_operator_pkey" PRIMARY KEY ("user_id")
);

-- Step 1: CreateIndex warehouse_operator (warehouse_id deliberately NOT unique)
CREATE INDEX "warehouse_operator_warehouse_id_idx" ON "warehouse_operator"("warehouse_id");

-- Step 1: AddForeignKey (new tables only — no dependency on `customer`)
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_operator" ADD CONSTRAINT "warehouse_operator_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_operator" ADD CONSTRAINT "warehouse_operator_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 2: Add customer.user_id as NULLABLE (existing rows transiently NULL)
ALTER TABLE "customer" ADD COLUMN "user_id" UUID;

-- Step 3: Mint one app_user per existing customer AND link it, in a single
-- correlated statement. The id fragment in `login` guarantees uniqueness
-- even for duplicate customer full_names. `gen_random_uuid()` is core
-- Postgres (13+); no extension required. The `'!'` password_hash is NOT a
-- valid bcrypt string, so `bcrypt.compare(pw, '!')` never matches —
-- backfilled buyers cannot log in until they set a password via the
-- password-reset flow (design.md §5). Deliberate: we never fabricate real
-- credentials. No-op on a fresh DB (zero customer rows).
--
-- IMPORTANT: the UPDATE below joins against the `new_users` CTE, NOT the
-- base `app_user` table. Sibling statements inside one WITH clause share a
-- single snapshot — a plain `FROM "app_user"` would use the pre-INSERT
-- snapshot and could not see the rows the CTE just inserted (0 rows would
-- ever match, leaving `customer.user_id` NULL and step 4's SET NOT NULL
-- failing). Referencing the CTE's own RETURNING projection sidesteps
-- snapshot visibility entirely — verified empirically against a fixture
-- with duplicate full_names and non-ASCII/punctuation characters.
WITH new_users AS (
  INSERT INTO "app_user" (id, login, password_hash, full_name, is_active, roles, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    lower(regexp_replace(c.full_name, '[^a-zA-Z0-9]+', '.', 'g')) || '.' || left(replace(c.id::text, '-', ''), 6),
    '!',
    c.full_name,
    true,
    1,
    now(),
    now()
  FROM "customer" c
  WHERE c.user_id IS NULL
  RETURNING id, login
)
UPDATE "customer" c
SET user_id = u.id
FROM new_users u
WHERE c.user_id IS NULL
  AND u.login = lower(regexp_replace(c.full_name, '[^a-zA-Z0-9]+', '.', 'g')) || '.' || left(replace(c.id::text, '-', ''), 6);

-- Step 4: Enforce NOT NULL — safe now, every row was backfilled in step 3.
ALTER TABLE "customer" ALTER COLUMN "user_id" SET NOT NULL;

-- Step 5: Add the 1:1 constraint + FK.
CREATE UNIQUE INDEX "customer_user_id_key" ON "customer"("user_id");
ALTER TABLE "customer" ADD CONSTRAINT "customer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
