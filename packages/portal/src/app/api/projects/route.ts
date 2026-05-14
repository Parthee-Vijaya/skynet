import { NextResponse } from "next/server";
import { getProjectsWithStatus } from "@/lib/projects.server";

/**
 * GET /api/projects — alle projekter med beriget git + memory status.
 *
 * Læser disk hver gang (ingen cache) — git-kald er hurtige (~10-30ms),
 * og memory-filer er små. Hvis det viser sig hot kan vi cache i 30s med
 * `unstable_cache` eller revalidatePath efter git post-commit hook.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const projects = getProjectsWithStatus();
  return NextResponse.json({
    projects,
    generatedAt: new Date().toISOString(),
  });
}
