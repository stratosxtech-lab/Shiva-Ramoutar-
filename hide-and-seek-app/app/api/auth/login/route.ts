import { signIn, withCookie } from "@/lib/auth";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = await body(req);
    const r = await signIn({ email: b.email, password: b.password });
    return withCookie({ user: r.user }, r.cookie);
  } catch (e) { return handle(() => Promise.reject(e)); }
}
