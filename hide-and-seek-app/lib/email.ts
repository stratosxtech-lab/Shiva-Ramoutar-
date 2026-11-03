import { db } from "./db";

/**
 * Sends email through Resend's REST API when RESEND_API_KEY and EMAIL_FROM are set.
 * Without them, nothing is sent and the attempt is recorded as "not configured", so the app keeps working.
 */
export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, paragraphs: string[], highlight?: string, button?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font:15px/1.55 Arial,sans-serif;color:#1A2733">${esc(p)}</p>`).join("");
  const hl = highlight
    ? `<p style="margin:18px 0;padding:14px;border:1px dashed #F4B740;border-radius:10px;font:700 20px/1.3 'Courier New',monospace;letter-spacing:2px;text-align:center;color:#121C26;background:#FFF8E6">${esc(highlight)}</p>`
    : "";
  const btn = button
    ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#F4B740;color:#2A1C00;text-decoration:none;font:700 15px Arial,sans-serif;padding:12px 18px;border-radius:10px">${esc(button.label)}</a></p>`
    : "";
  return `<div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="margin:0 0 6px;font:800 22px Arial,sans-serif;color:#121C26">Hide <span style="color:#D99A1E">&amp;</span> Seek</p>
    <h1 style="margin:0 0 16px;font:700 19px Arial,sans-serif;color:#121C26">${esc(title)}</h1>${body}${hl}${btn}
    <p style="margin:24px 0 0;font:12px Arial,sans-serif;color:#6B7C86">You received this because of activity on your Hide &amp; Seek account or purchase.</p></div>`;
}

export async function sendEmail(to: string | null | undefined, subject: string, title: string, paragraphs: string[], highlight?: string, button?: { label: string; url: string }) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  const sql = await db();
  if (!emailConfigured()) {
    await sql`INSERT INTO hs_emails (to_email, subject, status) VALUES (${to}, ${subject}, 'not configured')`;
    return false;
  }
  const text = [title, ...paragraphs, highlight ?? "", button ? `${button.label}: ${button.url}` : ""].filter(Boolean).join("\n\n");
  try {
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html: layout(title, paragraphs, highlight, button), text }),
    });
    await sql`INSERT INTO hs_emails (to_email, subject, status) VALUES (${to}, ${subject}, ${res.ok ? "sent" : `failed ${res.status}`})`;
    return res.ok;
  } catch (e) {
    console.error("Email failed", e);
    await sql`INSERT INTO hs_emails (to_email, subject, status) VALUES (${to}, ${subject}, 'failed')`;
    return false;
  }
}

/** The public address of the app, used in email links. */
export const siteUrl = (req?: Request) =>
  process.env.SITE_URL || (req ? new URL(req.url).origin : "https://hide-and-seek-gilt.vercel.app");
