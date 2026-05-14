import { NextResponse, type NextRequest } from "next/server";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { insertEvent } from "@/lib/firewall/store";

const exec = promisify(execCb);
export const dynamic = "force-dynamic";

interface KillBody {
  pid: number;
  process?: string;
  /** "term" (default, SIGTERM — net) eller "kill" (SIGKILL — hard). */
  signal?: "term" | "kill";
  /** Optional context for audit-log. */
  reason?: string;
  raddr?: string;
  rport?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as KillBody;
    if (!body.pid || !Number.isFinite(body.pid)) {
      return NextResponse.json({ error: "pid er påkrævet (number)" }, { status: 400 });
    }

    // Sanity check — never let us kill init or our own portal
    if (body.pid <= 1) {
      return NextResponse.json({ error: "pid <= 1 er ikke tilladt" }, { status: 400 });
    }
    if (body.pid === process.pid) {
      return NextResponse.json({ error: "kan ikke kill'e portal-processen selv" }, { status: 400 });
    }

    const sig = body.signal === "kill" ? "KILL" : "TERM";

    // Verify the pid actually exists before signaling
    let processName: string | null = null;
    try {
      const { stdout } = await exec(`ps -p ${body.pid} -o comm=`, { timeout: 1500 });
      processName = stdout.trim() || null;
    } catch {
      return NextResponse.json({ error: `pid ${body.pid} findes ikke (eller ingen adgang)` }, { status: 404 });
    }

    // Send the signal — only succeeds for processes the user owns
    try {
      process.kill(body.pid, `SIG${sig}` as NodeJS.Signals);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string })?.code;
      const status = code === "EPERM" ? 403 : code === "ESRCH" ? 404 : 500;
      return NextResponse.json(
        {
          ok: false,
          error: `kunne ikke sende SIG${sig} til pid ${body.pid}: ${msg}`,
          hint:
            code === "EPERM"
              ? "Process ejes af en anden bruger (typisk system) — Skynet (user-LaunchAgent) kan ikke afbryde den."
              : undefined,
        },
        { status }
      );
    }

    insertEvent({
      kind: "blocked",
      process: body.process ?? processName,
      raddr: body.raddr ?? null,
      detail: {
        action: "kill",
        signal: sig,
        pid: body.pid,
        rport: body.rport ?? null,
        reason: body.reason ?? "manual",
      },
    });

    return NextResponse.json({
      ok: true,
      pid: body.pid,
      signal: `SIG${sig}`,
      process: processName,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
