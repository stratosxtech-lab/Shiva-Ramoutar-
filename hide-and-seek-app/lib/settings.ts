import { db } from "./db";

/** App-wide switches the owner controls. Teams can switch some of these off for their own games. */
export const SETTINGS = {
  newGames: { label: "Allow new games", help: "Turn off to pause all new games, for example during maintenance.", team: false, default: true },
  freeHosting: { label: "Allow free games", help: "Let people host Classic games on the Free plan without an access code.", team: false, default: true },
  pricingPage: { label: "Show pricing page", help: "Show plans and prices to visitors.", team: false, default: true },
  onlineCheckout: { label: "Online checkout", help: "Let customers buy plans by card. Needs your Stripe keys in Vercel.", team: false, default: true },
  enquiries: { label: "Accept sign-ups and corporate enquiries", help: "Collect early-access sign-ups and corporate enquiry forms.", team: false, default: true },
  infection: { label: "Infection mode", help: "Found hiders join the seekers.", team: true, default: true },
  decoys: { label: "Decoy signals", help: "Each hider can drop one decoy per round.", team: true, default: true },
  chirp: { label: "Chirp sound", help: "Hiders' phones chirp every 2 minutes during the hunt.", team: true, default: true },
  tagRange: { label: "60 m tag range check", help: "Seekers must be within about 60 m to tag a hider.", team: true, default: true },
  liveScores: { label: "Live scores during games", help: "Players see the scoreboard while the game is running.", team: true, default: true },
  membersHost: { label: "Members can host games", help: "When off, only the team owner and admins can host.", team: true, default: true },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type Settings = Record<SettingKey, boolean>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const TEAM_KEYS = SETTING_KEYS.filter((k) => SETTINGS[k].team);

export const defaults = (): Settings =>
  Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTINGS[k].default])) as Settings;

export function clean(input: unknown, keys: readonly SettingKey[] = SETTING_KEYS): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (input && typeof input === "object") {
    for (const k of keys) {
      const v = (input as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

export async function getGlobal(): Promise<Settings> {
  const sql = await db();
  const rows = await sql<{ key: string; value: boolean }[]>`SELECT key, value FROM hs_settings`;
  const s = defaults();
  for (const r of rows) if (r.key in s) s[r.key as SettingKey] = !!r.value;
  return s;
}

export async function setGlobal(patch: Partial<Settings>) {
  const sql = await db();
  for (const [k, v] of Object.entries(patch)) {
    await sql`INSERT INTO hs_settings (key, value) VALUES (${k}, ${v}) ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
  }
  return getGlobal();
}

/** A team can only switch features off, never on when the owner has them off. */
export function effective(global: Settings, team?: Partial<Settings> | null): Settings {
  const s = { ...global };
  if (team) for (const k of TEAM_KEYS) if (team[k] === false) s[k] = false;
  return s;
}
