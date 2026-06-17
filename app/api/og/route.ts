import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      next: { revalidate: 3600 },
    });
    const html = await res.text();

    const get = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"));
      return m?.[1] ?? null;
    };

    const title = get("title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null;
    const image = get("image");
    const description = get("description");
    const hostname = new URL(url).hostname.replace(/^www\./, "");

    return NextResponse.json({ title, image, description, hostname });
  } catch {
    return NextResponse.json({ title: null, image: null, description: null, hostname: null });
  }
}
