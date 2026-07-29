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

  // 미리보기를 못 만들어도 호스트명은 URL만으로 늘 알 수 있다 —
  // "어디로 가는 링크인지"는 어떤 실패 경로에서도 알려준다.
  const hostname = parsed.hostname.replace(/^www\./, "");
  const bare = { title: null, image: null, description: null, hostname };

  try {
    // 리다이렉트를 수동으로 따라가며 홉마다 호스트를 재검증 —
    // 공개 URL이 내부망으로 리다이렉트해 최초 검사를 우회하는 SSRF 방지
    const MAX_REDIRECTS = 3;
    let target = parsed;
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(target.toString(), {
        // Googlebot을 사칭하면 오히려 손해다 — 봇 차단 WAF는 역DNS로 진짜 구글인지 검증하므로
        // 데이터센터 IP에서 온 Googlebot은 명백한 위조로 걸린다. 평범한 브라우저로 요청한다.
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
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
    // 에러 응답의 본문은 읽지 않는다 — 봇 차단(403)·404·로그인벽 페이지의 <title>은
    // "Access Denied" 같은 남의 문구라, 파싱하면 그게 우리 미리보기 제목으로 새어 나온다.
    // (리다이렉트 한도 초과로 최종 응답을 못 얻은 경우도 여기서 함께 걸린다)
    if (!res || !res.ok) return NextResponse.json(bare);

    const html = await res.text();

    // 엔티티를 남겨두면 og:image URL의 &amp;가 그대로 src에 박혀 이미지가 깨진다
    const decode = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");

    /**
     * og:*(property) → twitter:*(name) 순으로 찾는다.
     * 트위터 카드만 넣고 OG는 빠뜨린 사이트가 흔해서, 그 경우 썸네일을 통째로 놓친다.
     * 속성 순서가 뒤집힌 표기(content가 먼저)도 함께 본다.
     */
    const get = (prop: string) => {
      const keys = [
        ["property", `og:${prop}`],
        ["name", `twitter:${prop}`],
        ["property", `twitter:${prop}`],
      ] as const;
      for (const [attr, key] of keys) {
        const m =
          html.match(new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i")) ??
          html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, "i"));
        if (m?.[1]) return decode(m[1]);
      }
      return null;
    };

    const rawTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const title = get("title") ?? (rawTitle ? decode(rawTitle) : null);
    const image = get("image");
    const description = get("description");

    return NextResponse.json({ title, image, description, hostname });
  } catch {
    return NextResponse.json(bare);
  }
}
