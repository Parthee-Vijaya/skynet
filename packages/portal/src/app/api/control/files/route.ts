import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/control/auth";
import { getRoots, listDir } from "@/lib/control/files";

export const dynamic = "force-dynamic";

/**
 * GET /api/control/files            → liste af roots (for sidebar)
 * GET /api/control/files?root=projekter&path=foo/bar  → dir listing
 */
export async function GET(req: Request) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const rootId = url.searchParams.get("root");
  const relPath = url.searchParams.get("path") ?? "";

  if (!rootId) {
    // Returnér root-liste
    return NextResponse.json({ roots: getRoots() });
  }

  const listing = await listDir(rootId, relPath);
  if (!listing) {
    return NextResponse.json(
      { error: "root eller sti findes ikke / udenfor root" },
      { status: 404 }
    );
  }
  // Drop absolute hvis du ikke vil udstille det — men praktisk for UI footer
  return NextResponse.json(listing);
}
