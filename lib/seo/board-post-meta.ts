/**
 * 게시글 본문에서 meta description 을 뽑는다.
 *
 * 본문은 마크다운이라 그대로 넣으면 `##`·`**`·링크 문법이 검색결과 스니펫에 그대로 뜬다.
 * 서식 기호를 걷어내고 한 문단으로 접은 뒤 자른다.
 *
 * 본문이 비었거나 서식만 있는 글(이미지 한 장짜리 공지 등)은 제목을 되돌린다 —
 * 빈 description 을 내면 루트 값을 물려받아 **홈과 같은 설명**이 되고, 그게 바로
 * 네이버가 중복 문서로 잡는 조건이다.
 */
const MAX = 150;

/**
 * 길이 제한.
 *
 * `Array.from`으로 코드 포인트를 세는 건 이모지 때문이다 — `slice()`는 UTF-16 코드 단위로
 * 잘라서 서로게이트 쌍을 반토막 낸다(게시글 제목에 이모지가 실제로 들어 있다).
 * 반토막 난 문자는 검색결과 스니펫에 깨진 글자로 뜬다.
 */
function truncate(value: string): string {
  const chars = Array.from(value);
  if (chars.length <= MAX) return value;
  return `${chars.slice(0, MAX - 1).join("").trimEnd()}…`;
}

export function boardPostDescription(content: string, fallbackTitle: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ") // 코드 블록
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 링크는 글자만 남긴다
    .replace(/<[^>]+>/g, " ") // 인라인 HTML
    .replace(/^[>\-*+]\s+/gm, "") // 인용·목록 기호
    .replace(/[#*_`~|]/g, "") // 나머지 서식 기호
    .replace(/\s+/g, " ")
    .trim();

  // 폴백도 같은 제한을 탄다 — 긴 제목이 그대로 나가면 본문일 때만 지키던 규격이 무너진다.
  return truncate(plain || fallbackTitle);
}
