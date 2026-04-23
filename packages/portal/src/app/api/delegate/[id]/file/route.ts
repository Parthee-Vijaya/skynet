import { NextRequest } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { resolveArtifactPath } from "@/lib/delegate/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const rel = searchParams.get("path");
  if (!rel) return Response.json({ error: "path mangler" }, { status: 400 });

  const abs = resolveArtifactPath(id, rel);
  if (!abs) return Response.json({ error: "not found / forbidden" }, { status: 404 });

  const st = statSync(abs);
  if (st.isDirectory())
    return Response.json({ error: "er en mappe" }, { status: 400 });

  const ext = path.extname(abs).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const download = searchParams.get("download") === "1";

  const nodeStream = createReadStream(abs);
  const stream = Readable.toWeb(nodeStream) as ReadableStream;

  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Length": String(st.size),
    "Cache-Control": "no-cache",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${path.basename(abs)}"`;
  } else {
    headers["Content-Disposition"] = `inline; filename="${path.basename(abs)}"`;
  }
  return new Response(stream, { headers });
}
