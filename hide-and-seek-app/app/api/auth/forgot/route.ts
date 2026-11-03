import { requestReset } from "@/lib/auth";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await requestReset((await body(req)).email, req);
    return { ok: true };
  });
}
