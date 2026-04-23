import { NextRequest } from "next/server";
import {
  listReminders,
  addReminder,
  completeReminder,
  listReminderLists,
} from "@/lib/integrations/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "list";
  const list = searchParams.get("list") || undefined;
  const includeCompleted = searchParams.get("includeCompleted") === "true";

  try {
    if (mode === "lists") {
      const lists = await listReminderLists();
      return Response.json({ lists });
    }
    const reminders = await listReminders({ list, includeCompleted });
    return Response.json({ reminders, count: reminders.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "add";
    if (action === "add") {
      const res = await addReminder({
        title: body.title,
        list: body.list,
        dueDate: body.dueDate,
        body: body.body,
        priority: body.priority,
      });
      return Response.json(res, { status: res.ok ? 200 : 400 });
    }
    if (action === "complete") {
      const res = await completeReminder(body.id);
      return Response.json(res, { status: res.ok ? 200 : 400 });
    }
    return Response.json({ error: "ukendt action" }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
