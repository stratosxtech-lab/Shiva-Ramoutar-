import postgres from "postgres";

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __hsSql: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __hsSchema: Promise<void> | undefined;
}

function client() {
  if (!url) throw new Error("Database is not configured: set POSTGRES_URL.");
  if (!global.__hsSql) {
    const local = /localhost|127\.0\.0\.1|host=\/tmp/.test(url);
    global.__hsSql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      prepare: false,
      ssl: local ? false : "require",
      onnotice: () => {},
    });
  }
  return global.__hsSql;
}

export async function db() {
  const sql = client();
  if (!global.__hsSchema) {
    global.__hsSchema = migrate(sql).catch((e) => {
      global.__hsSchema = undefined;
      throw e;
    });
  }
  await global.__hsSchema;
  return sql;
}

async function migrate(sql: ReturnType<typeof postgres>) {
  await sql`
    CREATE TABLE IF NOT EXISTS hs_games (
      code text PRIMARY KEY,
      host_id text NOT NULL,
      mode text NOT NULL DEFAULT 'classic',
      status text NOT NULL DEFAULT 'lobby',
      round_seconds int NOT NULL DEFAULT 900,
      head_start int NOT NULL DEFAULT 60,
      radius_m int NOT NULL DEFAULT 200,
      center_lat double precision,
      center_lng double precision,
      started_at timestamptz,
      ended_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_players (
      id text PRIMARY KEY,
      game_code text NOT NULL REFERENCES hs_games(code) ON DELETE CASCADE,
      name text NOT NULL,
      role text NOT NULL DEFAULT 'hider',
      tag_code text NOT NULL,
      lat double precision,
      lng double precision,
      loc_at timestamptz,
      found_at timestamptz,
      found_by text,
      tags int NOT NULL DEFAULT 0,
      decoy_lat double precision,
      decoy_lng double precision,
      decoy_at timestamptz,
      score int NOT NULL DEFAULT 0,
      joined_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS hs_players_game ON hs_players(game_code)`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_events (
      id bigserial PRIMARY KEY,
      game_code text NOT NULL REFERENCES hs_games(code) ON DELETE CASCADE,
      at timestamptz NOT NULL DEFAULT now(),
      text text NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS hs_events_game ON hs_events(game_code, id)`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS max_players int NOT NULL DEFAULT 6`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS access_code text`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_access_codes (
      code text PRIMARY KEY,
      plan text NOT NULL,
      label text NOT NULL DEFAULT '',
      uses_left int,
      expires_at timestamptz NOT NULL,
      games_hosted int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_leads (
      id bigserial PRIMARY KEY,
      kind text NOT NULL,
      plan text,
      name text NOT NULL,
      email text NOT NULL,
      company text,
      team_size int,
      event_date text,
      message text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE TABLE IF NOT EXISTS hs_settings (key text PRIMARY KEY, value boolean NOT NULL)`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_teams (
      id text PRIMARY KEY,
      name text NOT NULL,
      access_code text NOT NULL UNIQUE REFERENCES hs_access_codes(code),
      admin_key text NOT NULL,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_team_members (
      id text PRIMARY KEY,
      team_id text NOT NULL REFERENCES hs_teams(id) ON DELETE CASCADE,
      name text NOT NULL,
      email text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT 'host',
      host_code text NOT NULL UNIQUE,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS team_id text`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS host_member text`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_orders (
      session_id text PRIMARY KEY,
      plan text NOT NULL,
      email text,
      amount_cents int,
      access_code text NOT NULL REFERENCES hs_access_codes(code),
      subscription_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS hs_orders_sub ON hs_orders(subscription_id)`;
  // Player accounts
  await sql`
    CREATE TABLE IF NOT EXISTS hs_users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_sessions (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES hs_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS hs_password_resets (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES hs_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    )`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS user_id text`;
  await sql`CREATE INDEX IF NOT EXISTS hs_players_user ON hs_players(user_id)`;
  await sql`ALTER TABLE hs_access_codes ADD COLUMN IF NOT EXISTS user_id text`;
  await sql`ALTER TABLE hs_access_codes ADD COLUMN IF NOT EXISTS email text`;
  // Game modes
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS half int NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS team text`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS decoys_left int NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS pulse_used boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS pulse_until timestamptz`;
  // Hunt twists: mystery boxes, power-ups, Freeze event, bonuses
  await sql`
    CREATE TABLE IF NOT EXISTS hs_boxes (
      id bigserial PRIMARY KEY,
      game_code text NOT NULL REFERENCES hs_games(code) ON DELETE CASCADE,
      half int NOT NULL DEFAULT 1,
      slot int NOT NULL,
      lat double precision NOT NULL,
      lng double precision NOT NULL,
      spawned_at timestamptz NOT NULL DEFAULT now(),
      claimed_by text,
      claimed_at timestamptz,
      UNIQUE (game_code, half, slot)
    )`;
  for (const col of ["shield_until", "ghost_until", "tracker_until", "spotted_until"]) {
    await sql.unsafe(`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS ${col} timestamptz`);
  }
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS freeze_lat double precision`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS freeze_lng double precision`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS boxes int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS bonus int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS first_find boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE hs_players ADD COLUMN IF NOT EXISTS min_seeker_m int`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS sonar_at timestamptz`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS squeeze_until timestamptz`;
  await sql`ALTER TABLE hs_games ADD COLUMN IF NOT EXISTS freeze_stage int NOT NULL DEFAULT 0`;
  // Email log, so the owner can see what was sent
  await sql`
    CREATE TABLE IF NOT EXISTS hs_emails (
      id bigserial PRIMARY KEY,
      to_email text NOT NULL,
      subject text NOT NULL,
      status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
}
