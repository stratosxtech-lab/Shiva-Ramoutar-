import { signOut, withCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withCookie({ ok: true }, await signOut(req));
}
