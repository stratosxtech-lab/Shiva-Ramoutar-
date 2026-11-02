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
}
