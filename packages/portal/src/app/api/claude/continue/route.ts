/**
 * /api/claude/continue — spawn `claude --resume <sessionId> -p "<prompt>"`
 * detached i background. Bruges af /continue/<id>-siden og af Telegram-
 * tool'et continue_claude_session.
 *
 * Auth: control_token (samme pattern som andre control-endpoints).
 *
 * Hvad der sker:
 *   1. Validerer input (sessionId UUID-format, prompt non-empty, cwd safe)
 *   2. spawn'er claude med detached: true, stdio ignore — Skynet behøver
 *      ikke vente på svaret. Stop-hooket fyrer når claude er færdig og
 *      sender ny notifikation via /api/agent-events
 *   3. Returnerer { ok, pid, message }
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { requireAuth } from "@/lib/control/auth";
import { appendLog } from "@/lib/agent/log-buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContinueBody {
  sessionId?: string;
  prompt?: string;
  cwd?: string;
}

const CLAUDE_BIN_CANDIDATES = [
  process.env.CLAUDE_BIN,
  `${process.env.HOME}/.local/bin/claude`,
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  "/usr/bin/claude",
].filter(Boolean) as string[];

function findClaudeBin(): string | null {
  for (const p of CLAUDE_BIN_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;

  let body: ContinueBody = {};
  try {
    body = (await req.json()) as ContinueBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const sessionId = (body.sessionId ?? "").trim();
  const prompt = (body.prompt ?? "").trim();
  const cwd = (body.cwd ?? process.env.HOME ?? process.cwd()).trim();

  if (!sessionId || !/^[0-9a-fA-F-]{8,64}$/.test(sessionId)) {
    return NextResponse.json({ ok: false, error: "ugyldig sessionId" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt er påkrævet" }, { status: 400 });
  }
  // Cwd safety: skal være absolut path, må ikke indeholde shell-meta
  if (!cwd.startsWith("/") || /[`$;&|<>]/.test(cwd)) {
    return NextResponse.json({ ok: false, error: "ugyldig cwd" }, { status: 400 });
  }
  if (!existsSync(cwd)) {
    return NextResponse.json({ ok: false, error: `cwd findes ikke: ${cwd}` }, { status: 400 });
  }

  const bin = findClaudeBin();
  if (!bin) {
    return NextResponse.json({
      ok: false,
      error: "claude-CLI ikke fundet. Sæt CLAUDE_BIN env-var eller installér i ~/.local/bin/claude",
    }, { status: 500 });
  }

  // Spawn detached — Skynet skal ikke vente. Stop-hook fyrer ny notif når
  // sessionen slutter
  let pid: number | undefined;
  try {
    const child = spawn(bin, ["--resume", sessionId, "-p", prompt], {
      cwd,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        // Sikr at hooks fyrer i den nye session
        CLAUDE_FORCE_HOOKS: "1",
      },
    });
    pid = child.pid;
    child.unref();
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "spawn fejlede",
    }, { status: 500 });
  }

  appendLog("info", `claude --resume ${sessionId.slice(0, 8)} kicked off (pid=${pid}) prompt="${prompt.slice(0, 60)}"`, {
    automationName: "claude-continue",
    tool: "claude-continue",
  });

  return NextResponse.json({
    ok: true,
    pid,
    sessionId,
    cwd,
    message: `Claude Code genstartet med din prompt. Stop-hook sender ny notifikation når den er færdig.`,
  });
}
