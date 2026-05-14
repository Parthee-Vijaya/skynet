import { NextResponse, type NextRequest } from "next/server";
import { getOrRefresh, invalidate } from "@/lib/cache";
import {
  addRule as addLuluRule,
  listRules as listLuluRules,
  detectLulu,
  reloadLulu,
} from "@/lib/firewall/lulu";
import {
  insertRule,
  listRules,
  replaceLuluRules,
  type NetRuleRow,
  type RuleUpsert,
} from "@/lib/firewall/store";

export const dynamic = "force-dynamic";

interface RulesResponse {
  rules: NetRuleRow[];
  luluAvailable: boolean;
  syncedAt: number | null;
}

let lastLuluSync = 0;

async function refreshFromLulu(): Promise<RulesResponse> {
  const status = await detectLulu();
  if (!status.cliInstalled) {
    return {
      rules: listRules(),
      luluAvailable: false,
      syncedAt: null,
    };
  }
  try {
    const luluRules = await listLuluRules();
    const upserts: RuleUpsert[] = luluRules.map((r) => ({
      lulu_key: r.key,
      exec_path: r.path === "*" ? null : r.path,
      action: r.action,
      scope:
        r.addr && r.addr !== "*" && r.port && r.port !== "*" ? "host:port" :
        r.addr && r.addr !== "*" ? "host" : "all",
      remote_host: r.addr === "*" ? null : (r.addr ?? null),
      remote_port: r.port && r.port !== "*" ? Number(r.port) : null,
      source: "lulu",
      description: r.uuid ? `lulu:${r.uuid}` : null,
    }));
    replaceLuluRules(upserts);
    lastLuluSync = Date.now();
  } catch {
    // lulu-cli failed; keep existing mirror
  }
  return {
    rules: listRules(),
    luluAvailable: true,
    syncedAt: lastLuluSync || null,
  };
}

export async function GET() {
  try {
    const data = await getOrRefresh<RulesResponse>("firewall_rules", 5_000, refreshFromLulu);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

interface PostBody {
  /** App identifier — code-signing-id eller bundle-id. */
  lulu_key: string;
  /** Eksekverbar sti, eller "*". */
  exec_path?: string;
  process?: string;
  action: "allow" | "block";
  scope: "all" | "host" | "host:port";
  remote_host?: string;
  remote_port?: number;
  description?: string;
  /** Hvis true (default), spawn lulu-cli + reload. Hvis false, kun gem i Skynet's egen DB. */
  applyToLulu?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody;
    if (!body.lulu_key || !body.action || !body.scope) {
      return NextResponse.json({ error: "lulu_key, action, scope er påkrævet" }, { status: 400 });
    }

    const applyToLulu = body.applyToLulu !== false;

    if (applyToLulu) {
      const status = await detectLulu();
      if (!status.cliInstalled) {
        return NextResponse.json(
          { error: "lulu-cli ikke installeret — kan ikke håndhæve regel. Brug applyToLulu=false for kun at gemme i Skynet." },
          { status: 412 }
        );
      }
      if (!status.sudoersOk) {
        return NextResponse.json(
          { error: "Passwordless sudo ikke konfigureret for lulu-cli — kør install.sh." },
          { status: 412 }
        );
      }
      await addLuluRule({
        key: body.lulu_key,
        path: body.exec_path ?? "*",
        action: body.action,
        addr: body.scope === "all" ? "*" : body.remote_host,
        port: body.scope === "host:port" && body.remote_port ? String(body.remote_port) : "*",
      });
      // Reload before mirroring so the next list reflects truth.
      await reloadLulu();
    }

    // Mirror in Skynet DB
    const id = insertRule({
      lulu_key: body.lulu_key,
      process: body.process ?? null,
      exec_path: body.exec_path ?? null,
      action: body.action,
      scope: body.scope,
      remote_host: body.remote_host ?? null,
      remote_port: body.remote_port ?? null,
      source: applyToLulu ? "lulu" : "skynet",
      description: body.description ?? null,
    });

    invalidate("firewall_rules");
    invalidate("firewall_lulu_status");
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
