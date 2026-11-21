import { NextRequest } from "next/server";
import { db } from "@/db";
import { ensurePulseSchema } from "@/db/ensureSchema";
import { scrobbles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { corsHeaders, getSessionScrobbles } from "@/lib/sessionService";
import { sanitizeSessionId, serializeScrobble } from "@/lib/realtimeHub";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function escapeCsv(val: string | number): string {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sessionId = sanitizeSessionId(sp.get("session"));
    const format = (sp.get("format") ?? "json").toLowerCase();

    const rows = await getSessionScrobbles(sessionId, 500);
    const items = rows.map(serializeScrobble);

    if (format === "csv") {
      const header = [
        "id",
        "playedAt",
        "title",
        "artist",
        "album",
        "appName",
        "durationMs",
        "sessionId",
      ].join(",");
      const lines = items.map((item) =>
        [
          escapeCsv(item.id),
          escapeCsv(item.playedAt),
          escapeCsv(item.title),
          escapeCsv(item.artist),
          escapeCsv(item.album),
          escapeCsv(item.appName),
          escapeCsv(item.durationMs),
          escapeCsv(item.sessionId),
        ].join(",")
      );
      const csvContent = [header, ...lines].join("\n");

      return new Response(csvContent, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="pulsecast-scrobbles-${sessionId}.csv"`,
        },
      });
    }

    if (sp.get("download") === "true") {
      return new Response(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            sessionId,
            totalScrobbles: items.length,
            scrobbles: items,
          },
          null,
          2
        ),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="pulsecast-scrobbles-${sessionId}.json"`,
          },
        }
      );
    }

    return Response.json(
      { ok: true, sessionId, scrobbles: items },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("GET /api/scrobbles failed:", err);
    return Response.json(
      { ok: false, error: "Failed to export scrobbles" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensurePulseSchema();
    const sessionId = sanitizeSessionId(req.nextUrl.searchParams.get("session"));
    await db.delete(scrobbles).where(eq(scrobbles.sessionId, sessionId));
    return Response.json({ ok: true, cleared: true }, { headers: corsHeaders });
  } catch (err) {
    console.error("DELETE /api/scrobbles failed:", err);
    return Response.json(
      { ok: false, error: "Failed to clear scrobbles" },
      { status: 500, headers: corsHeaders }
    );
  }
}
