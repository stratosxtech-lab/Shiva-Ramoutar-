import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { GameError } from "./game";
import { sendEmail, siteUrl } from "./email";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "hs_session";
const SESSION_DAYS = 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type User = { id: string; email: string; name: string; created_at: Date };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function checkPassword(pw: string, stored: string) {
  const [, saltHex, keyHex] = stored.split("$");
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function validPassword(pw: unknown): string {
  const s = String(pw ?? "");
  if (s.length < 8) throw new GameError("Use a password of at least 8 characters.");
  if (s.length > 200) throw new GameError("That password is too long.");
  return s;
}

function cookieHeader(token: string, maxAgeSeconds: number) {
  const secure = process.env.VERCEL ? "; Secure" : ""; // Vercel always serves over HTTPS
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

async function startSession(userId: string) {
  const sql = await db();
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO hs_sessions (token_hash, user_id, expires_at) VALUES (${sha(token)}, ${userId}, now() + ${SESSION_DAYS + " days"}::interval)`;
  return cookieHeader(token, SESSION_DAYS * 86400);
}

/** Wraps a JSON response so it also sets or clears the session cookie. */
export function withCookie(data: unknown, cookie: string) {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "set-cookie": cookie } });
}

export async function signUp(input: { email: unknown; name: unknown; password: unknown }) {
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 120);
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  if (!EMAIL.test(email)) throw new GameError("Enter a valid email address.");
  if (!name) throw new GameError("Enter your name as other players will see it.");
  const pw = validPassword(input.password);
  const sql = await db();
  const id = randomBytes(10).toString("hex");
  const [row] = await sql`
    INSERT INTO hs_users (id, email, name, password_hash) VALUES (${id}, ${email}, ${name}, ${await hashPassword(pw)})
    ON CONFLICT (email) DO NOTHING RETURNING id`;
  if (!row) throw new GameError("An account with that email already exists. Sign in instead.", 409);
  // Attach codes bought with this email before the account existed.
  await sql`UPDATE hs_access_codes SET user_id = ${id} WHERE user_id IS NULL AND lower(email) = ${email}`;
  return { user: { id, email, name }, cookie: await startSession(id) };
}

export async function signIn(input: { email: unknown; password: unknown }) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const sql = await db();
  const [u] = await sql<(User & { password_hash: string })[]>`SELECT * FROM hs_users WHERE email = ${email}`;
  const ok = u ? await checkPassword(String(input.password ?? ""), u.password_hash) : await checkPassword("x", "scrypt$00$00");
  if (!u || !ok) throw new GameError("That email and password don't match. Try again or reset your password.", 401);
  return { user: { id: u.id, email: u.email, name: u.name }, cookie: await startSession(u.id) };
}

function readToken(req: Request) {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

export async function currentUser(req: Request): Promise<User | null> {
  const token = readToken(req);
  if (!token) return null;
  const sql = await db();
  const [u] = await sql<User[]>`
    SELECT u.id, u.email, u.name, u.created_at FROM hs_sessions s JOIN hs_users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha(token)} AND s.expires_at > now()`;
  return u ?? null;
}

export async function requireUser(req: Request) {
  const u = await currentUser(req);
  if (!u) throw new GameError("Sign in to continue.", 401);
  return u;
}

export async function signOut(req: Request) {
  const token = readToken(req);
  if (token) {
    const sql = await db();
    await sql`DELETE FROM hs_sessions WHERE token_hash = ${sha(token)}`;
  }
  return cookieHeader("", 0);
}

export async function requestReset(emailInput: unknown, req: Request) {
  const email = String(emailInput ?? "").trim().toLowerCase();
  const sql = await db();
  const [u] = await sql<User[]>`SELECT id, email, name FROM hs_users WHERE email = ${email}`;
  if (!u) return; // Same response either way, so the form doesn't reveal who has an account.
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO hs_password_resets (token_hash, user_id, expires_at) VALUES (${sha(token)}, ${u.id}, now() + interval '1 hour')`;
  await sendEmail(u.email, "Reset your Hide & Seek password", "Reset your password",
    [`Hi ${u.name}, we received a request to reset your password. The link below works for one hour.`,
      "If you didn't ask for this, you can ignore this email and your password stays the same."],
    undefined, { label: "Choose a new password", url: `${siteUrl(req)}/account/reset#token=${token}` });
}

export async function resetPassword(tokenInput: unknown, password: unknown) {
  const pw = validPassword(password);
  const sql = await db();
  const [r] = await sql<{ user_id: string }[]>`
    DELETE FROM hs_password_resets WHERE token_hash = ${sha(String(tokenInput ?? ""))} AND expires_at > now() RETURNING user_id`;
  if (!r) throw new GameError("This reset link has expired or was already used. Request a new one.", 400);
  await sql`UPDATE hs_users SET password_hash = ${await hashPassword(pw)} WHERE id = ${r.user_id}`;
  await sql`DELETE FROM hs_sessions WHERE user_id = ${r.user_id}`;
  return { cookie: await startSession(r.user_id) };
}
