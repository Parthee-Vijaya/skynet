import { NextResponse, type NextRequest } from "next/server";
import { invalidate } from "@/lib/cache";
import { addRule as addLuluRule, detectLulu, reloadLulu } from "@/lib/firewall/lulu";
import { insertRule } from "@/lib/firewall/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BatchBody {
  lulu_key: string;
  exec_path?: string;
  process?: string;
  hosts: Array<{ host: string; raddr?: string; reason?: string }>;
  /** Block samtlige eller bare cache i Skynet uden at reload'e LuLu */
  applyToLulu?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BatchBody;
    if (!body.lulu_key || !Array.isArray(body.hosts) || body.hosts.length === 0) {
      return NextResponse.json({ error: "lulu_key og hosts (array) er påkrævet" }, { status: 400 });
    }

    const applyToLulu = body.applyToLulu !== false;

    if (applyToLulu) {
      const status = await detectLulu();
      if (!status.cliInstalled || !status.sudoersOk) {
        return NextResponse.json(
          { error: "lulu-cli + sudoers skal være sat op for at håndhæve regler" },
          { status: 412 }
        );
      }
    }

    const results: Array<{ host: string; ok: boolean; error?: string; ruleId?: number }> = [];
    let added = 0;

    for (const h of body.hosts) {
      try {
        if (applyToLulu) {
          await addLuluRule({
            key: body.lulu_key,
            path: body.exec_path ?? "*",
            action: "block",
            addr: h.host,
            port: "*",
          });
        }
        const id = insertRule({
          lulu_key: body.lulu_key,
          process: body.process ?? null,
          exec_path: body.exec_path ?? null,
          action: "block",
          scope: "host",
          remote_host: h.host,
          remote_port: null,
          source: applyToLulu ? "lulu" : "skynet",
          description: `batch-block (${h.reason ?? "tracker"}): ${body.process ?? body.lulu_key} → ${h.host}`,
        });
        results.push({ host: h.host, ok: true, ruleId: id });
        added++;
      } catch (e) {
        results.push({ host: h.host, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Single reload at end (cheaper than reloading per rule)
    if (applyToLulu && added > 0) {
      try {
        await reloadLulu();
      } catch (e) {
        return NextResponse.json(
          {
            ok: false,
            added,
            failed: results.length - added,
            results,
            warning: `${added} regler tilføjet i plist, men reload fejlede: ${e instanceof Error ? e.message : String(e)}. Kør 'sudo lulu-cli reload' manuelt.`,
          },
          { status: 207 }
        );
      }
    }

    invalidate("firewall_rules");
    invalidate("firewall_lulu_status");

    return NextResponse.json({
      ok: true,
      added,
      failed: results.length - added,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
