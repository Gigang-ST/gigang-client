import { NextRequest, NextResponse } from "next/server";

/**
 * SSRF 방지: 내부망을 가리킬 수 있는 호스트 차단.
 * 이 라우트는 임의 URL을 서버에서 fetch하므로 루프백·사설·링크로컬(메타데이터) 대역을 거부한다.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 리터럴은 링크 미리보기 용도에 불필요 — 전부 차단
  if (h.includes(":") || h.startsWith("[")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true; // 루프백·사설 A
    if (a === 172 && b >= 16 && b <= 31) return true; // 사설 B
    if (a === 192 && b === 168) return true; // 사설 C
    if (a === 169 && b === 254) return true; // 링크로컬·클라우드 메타데이터
  }
  return false;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    // 리다이렉트를 수동으로 따라가며 홉마다 호스트를 재검증 —
    // 공개 URL이 내부망으로 리다이렉트해 최초 검사를 우회하는 SSRF 방지
    const MAX_REDIRECTS = 3;
    let target = parsed;
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(target.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        redirect: "manual",
        next: { revalidate: 3600 },
      });
      if (res.status < 300 || res.status >= 400) break;

      const location = res.headers.get("location");
      if (!location) break;
      const next = new URL(location, target);
      if (!["http:", "https:"].includes(next.protocol) || isBlockedHost(next.hostname)) {
        return NextResponse.json({ error: "invalid url" }, { status: 400 });
      }
      target = next;
    }
    // 리다이렉트 한도 초과 등으로 최종 응답을 못 얻으면 미리보기 없음 처리
    if (!res || (res.status >= 300 && res.status < 400)) {
      return NextResponse.json({ title: null, image: null, description: null, hostname: null });
    }
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
