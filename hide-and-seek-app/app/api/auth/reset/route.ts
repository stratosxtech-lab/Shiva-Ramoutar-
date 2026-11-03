import { resetPassword, withCookie } from "@/lib/auth";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = await body(req);
    const r = await resetPassword(b.token, b.password);
    return withCookie({ ok: true }, r.cookie);
  } catch (e) { return handle(() => Promise.reject(e)); }
}
