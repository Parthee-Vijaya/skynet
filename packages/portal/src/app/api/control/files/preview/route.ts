import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { readTextPreview } from "@/lib/control/files";

export const dynamic = "force-dynamic";

/**
 * GET /api/control/files/preview?root=X&path=foo/bar.txt
 * Returnerer JSON med tekst-indhold (op til 2MB) eller metadata for ikke-tekst.
 */
export async function GET(req: Request) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const rootId = url.searchParams.get("root");
  const relPath = url.searchParams.get("path");
  if (!rootId || !relPath) {
    return NextResponse.json({ error: "root og path kræves" }, { status: 400 });
  }

  const preview = await readTextPreview(rootId, relPath);
  if (!preview) {
    return NextResponse.json(
      { error: "fil findes ikke / udenfor root" },
      { status: 404 }
    );
  }
  return NextResponse.json(preview);
}
