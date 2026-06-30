import { NextRequest, NextResponse } from "next/server";

// Sentry tunnel — 광고 차단기 우회용 프록시
// https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option

const SENTRY_HOST = "o4511647317884928.ingest.us.sentry.io";
const SENTRY_PROJECT_IDS = ["4511647320637440"];

export async function POST(req: NextRequest) {
  try {
    const envelope = await req.text();
    const [header] = envelope.split("\n", 1);
    const { dsn } = JSON.parse(header) as { dsn: string };

    const url = new URL(dsn);
    const projectId = url.pathname.replace("/", "");

    if (url.hostname !== SENTRY_HOST) {
      return NextResponse.json({ error: "invalid host" }, { status: 400 });
    }
    if (!SENTRY_PROJECT_IDS.includes(projectId)) {
      return NextResponse.json({ error: "invalid project" }, { status: 400 });
    }

    const sentryUrl = `https://${SENTRY_HOST}/api/${projectId}/envelope/`;
    const response = await fetch(sentryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });

    return new NextResponse(response.body, { status: response.status });
  } catch {
    return NextResponse.json({ error: "tunnel error" }, { status: 500 });
  }
}
