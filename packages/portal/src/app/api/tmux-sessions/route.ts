/**
 * /api/tmux-sessions — lister aktive tmux-sessioner + per-vindue info.
 *
 * Bruges af TmuxAgentsWidget til at vise coding-agent-overblik i cockpittet.
 * Ingen auth-krav (read-only lokal info — samme som /api/system).
 */

import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exec = promisify(execCb);

// Sikker input-validering: tmux session-navne er [a-zA-Z0-9_-] 1-64 tegn
const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export interface TmuxWindow {
  idx: number;
  name: string;
  /** Kommando der kører i den fokuserede pane (fx "claude", "node", "zsh") */
  cmd: string;
  active: boolean;
}

export interface TmuxSession {
  name: string;
  windows: number;
  /** Unix-ms timestamp for seneste aktivitet */
  activityTs: number;
  /** Er SSH/terminal-klient attached lige nu? */
  attached: boolean;
  windowList: TmuxWindow[];
}

async function listSessions(): Promise<TmuxSession[]> {
  const { stdout } = await exec(
    `tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_activity}|#{session_attached}' 2>/dev/null`,
    { timeout: 2000 },
  );
  const lines = stdout.trim().split("\n").filter(Boolean);
  const sessions: TmuxSession[] = [];
  for (const line of lines) {
    const [name, windows, activity, attached] = line.split("|");
    if (!SESSION_NAME_RE.test(name)) continue;
    sessions.push({
      name,
      windows: parseInt(windows, 10),
      activityTs: parseInt(activity, 10) * 1000,
      attached: attached === "1",
      windowList: [],
    });
  }
  // Berig med window-info pr. session
  await Promise.all(
    sessions.map(async (s) => {
      try {
        const { stdout: winOut } = await exec(
          `tmux list-windows -t ${s.name} -F '#{window_index}|#{window_name}|#{pane_current_command}|#{window_active}'`,
          { timeout: 1500 },
        );
        s.windowList = winOut.trim().split("\n").filter(Boolean).map((l) => {
          const [idx, wname, cmd, active] = l.split("|");
          return {
            idx: parseInt(idx, 10),
            name: wname,
            cmd,
            active: active === "1",
          };
        });
      } catch {
        /* ignorer — session kan være lukket imens vi forespørger */
      }
    }),
  );
  return sessions;
}

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json({ sessions, at: new Date().toISOString() });
  } catch {
    // tmux ikke installeret eller ingen sessioner — returnér tom liste
    return NextResponse.json({ sessions: [], at: new Date().toISOString() });
  }
}
