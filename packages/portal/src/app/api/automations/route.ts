import { NextRequest } from "next/server";
import {
  listAutomations,
  createAutomation,
  type CreateAutomationInput,
} from "@/lib/agent/automations";
import { reloadScheduler } from "@/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ automations: listAutomations() });
}

export async function POST(req: NextRequest) {
  let body: CreateAutomationInput;
  try {
    body = (await req.json()) as CreateAutomationInput;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.name || !body.trigger || !body.action) {
    return Response.json(
      { error: "name, trigger og action er påkrævet" },
      { status: 400 }
    );
  }
  const created = createAutomation(body);
  reloadScheduler();
  return Response.json({ automation: created });
}
