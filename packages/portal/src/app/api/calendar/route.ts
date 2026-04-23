import { NextRequest } from "next/server";
import {
  listTodayEvents,
  listUpcomingEvents,
  listCalendars,
} from "@/lib/integrations/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "today";
  const hoursStr = searchParams.get("hours");
  const calendarsStr = searchParams.get("calendars");
  const calendars = calendarsStr
    ? calendarsStr.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    if (mode === "calendars") {
      const names = await listCalendars();
      return Response.json({ calendars: names });
    }
    if (mode === "upcoming") {
      const hours = hoursStr ? parseInt(hoursStr, 10) : 24;
      const events = await listUpcomingEvents(hours, calendars);
      return Response.json({ events, count: events.length });
    }
    // default: today
    const events = await listTodayEvents(calendars);
    return Response.json({ events, count: events.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
