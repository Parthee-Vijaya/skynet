import { requireAuth } from "@/lib/control/auth";
import { readBinary } from "@/lib/control/files";

export const dynamic = "force-dynamic";

/**
 * GET /api/control/files/raw?root=X&path=foo/bar.png
 * Streamer binær fil (kun billeder pt — til <img src="">-brug).
 * Max 20MB, ellers 404.
 */
export async function GET(req: Request) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const rootId = url.searchParams.get("root");
  const relPath = url.searchParams.get("path");
  if (!rootId || !relPath) {
    return new Response("root og path kræves", { status: 400 });
  }

  const file = await readBinary(rootId, relPath);
  if (!file) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(file.buf), {
    status: 200,
    headers: {
      "content-type": file.mime,
      "content-length": String(file.size),
      "cache-control": "private, max-age=60",
    },
  });
}
