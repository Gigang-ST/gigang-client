/**
 * 로그인·온보딩 뒤 이동 주소(`next`) 검증 — 같은 사이트 안의 경로만 통과시킨다.
 *
 * `startsWith("/") && !startsWith("//")` 만으로는 부족하다. 브라우저는 `/\evil.com` 의 역슬래시를
 * 슬래시로 취급해 외부 주소로 보내고, 탭·줄바꿈은 URL 파서가 지워 `//` 가 되살아난다.
 * 그래서 가짜 origin 에 붙여 파싱한 뒤 origin 이 그대로인지 확인하고, 경로(+쿼리·해시)만 돌려준다.
 */
const PARSE_BASE = "https://safe-redirect.invalid";

export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string" || raw === "") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // 역슬래시(원문·%5C 인코딩)와 제어문자는 파서마다 해석이 갈려 아예 거절
  if (/[\\\u0000-\u001f\u007f]/.test(raw) || /%5c/i.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, PARSE_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== PARSE_BASE) return fallback;
  // 정규화 결과도 `//` 로 시작하면 외부로 해석될 수 있다
  const path = url.pathname + url.search + url.hash;
  if (path.startsWith("//")) return fallback;
  return path;
}
