import { publicSupabaseUrl } from "@/lib/supabase/public-env";

/**
 * 사진이 사는 버킷. 멤버별 폴더(`{mem_id}/{timestamp}.jpg`).
 *
 * `lib/storage/post-photo.ts`가 아니라 여기 두는 이유: 저 파일은 `server-only`를 물고 있어
 * zod 스키마(`lib/validations/*`)가 import하는 순간 클라이언트 번들 빌드가 깨진다.
 * 검증에 필요한 건 상수와 순수 함수뿐이라 이쪽으로 갈라 둔다.
 */
export const POST_PHOTO_BUCKET = "post-photos";

/**
 * 우리 Storage의 정규 공개 URL인지 검사한다.
 *
 * **왜 필요한가**: `photo_url`은 클라이언트가 JSON으로 보내는 값이라, 스키마가 `z.url()`만
 * 보면 아무 외부 주소나 통과한다. 그 값은 `evt_mlg_act_hist`에 그대로 저장되고 DB 트리거
 * (`post_sync_from_mlg_act`)가 기강이야기 지면에 복제하므로, 남의 서버 이미지·추적 픽셀이
 * 전광판에 걸릴 수 있다(열람자 IP가 그 서버로 샌다).
 *
 * 그래서 **출처를 못 박는다**: 우리 Supabase 프로젝트의 `post-photos` 공개 URL만 허용한다.
 * 형태는 `{SUPABASE_URL}/storage/v1/object/public/post-photos/{mem_id}/{ts}.jpg`.
 *
 * 소유권(경로 앞이 본인 mem_id인가)까지는 여기서 안 본다 — 스키마는 mem_id를 모른다.
 * 그건 호출부(서버 액션)가 `assertOwnPostPhotoUrl`로 확인한다.
 */
export function isPostPhotoUrl(url: string): boolean {
  const prefix = `${publicSupabaseUrl}/storage/v1/object/public/${POST_PHOTO_BUCKET}/`;
  if (!url.startsWith(prefix)) return false;

  // 접두사만 보면 `.../post-photos/../../다른버킷/x.jpg` 같은 경로 탈출이 통과한다.
  const rest = url.slice(prefix.length);
  if (!rest || rest.includes("..")) return false;

  // `{mem_id}/{파일명}` 두 마디여야 한다. 쿼리스트링(`?t=`)은 허용(변환 옵션 등).
  const path = rest.split("?")[0];
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  return parts.every((p) => p.length > 0);
}

/**
 * 그 URL이 **이 멤버의 폴더**에 있는지. 업로드 경로가 `{mem_id}/...`라 앞마디가 곧 소유자다.
 *
 * 이게 없으면 남이 올린 사진 URL을 그대로 자기 기록에 붙여 남의 사진을 자기 것으로
 * 전광판에 세울 수 있다(Storage RLS는 *쓰기*만 막지, 남의 공개 URL을 *참조*하는 건 못 막는다).
 */
export function isOwnPostPhotoUrl(url: string, memId: string): boolean {
  if (!isPostPhotoUrl(url)) return false;
  const prefix = `${publicSupabaseUrl}/storage/v1/object/public/${POST_PHOTO_BUCKET}/`;
  return url.slice(prefix.length).split("?")[0].split("/")[0] === memId;
}
