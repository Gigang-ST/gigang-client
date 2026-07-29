import { describe, expect, it, vi } from "vitest";

// publicSupabaseUrl은 모듈 로드시 env를 읽으므로 고정값으로 대체한다.
vi.mock("@/lib/supabase/public-env", () => ({
  publicSupabaseUrl: "https://proj.supabase.co",
  publicSupabaseKey: "test-key",
}));

const { isOwnPostPhotoUrl, isPostPhotoUrl } = await import("./post-photo-url");

const MEM = "7dd2ab13-a196-4080-a9c3-923e679d6b06";
const OTHER = "863be2e3-86ff-4109-9768-2fd0d3e8aa17";
const BASE = "https://proj.supabase.co/storage/v1/object/public/post-photos";

describe("isPostPhotoUrl", () => {
  it("우리 버킷의 정규 공개 URL을 통과시킨다", () => {
    expect(isPostPhotoUrl(`${BASE}/${MEM}/1785244104270-a1b2c3.jpg`)).toBe(true);
  });

  it("쿼리스트링이 붙어도 통과한다", () => {
    expect(isPostPhotoUrl(`${BASE}/${MEM}/1785244104270.jpg?t=123`)).toBe(true);
  });

  // 여기부터가 이 함수의 존재 이유 — 외부 URL이 저장되면 트리거가 전광판에 복제하고
  // 열람자 IP가 그 서버로 샌다.
  it("외부 호스트를 막는다", () => {
    expect(
      isPostPhotoUrl(`https://evil.example.com/storage/v1/object/public/post-photos/${MEM}/x.jpg`),
    ).toBe(false);
  });

  it("추적 픽셀 같은 임의 주소를 막는다", () => {
    expect(isPostPhotoUrl("https://tracker.example.com/pixel.gif")).toBe(false);
  });

  it("우리 도메인이라도 다른 버킷은 막는다", () => {
    expect(
      isPostPhotoUrl("https://proj.supabase.co/storage/v1/object/public/avatars/x/y.jpg"),
    ).toBe(false);
  });

  it("경로 탈출(..)을 막는다", () => {
    expect(isPostPhotoUrl(`${BASE}/../avatars/x/y.jpg`)).toBe(false);
  });

  it("호스트를 접두사로만 흉내낸 주소를 막는다", () => {
    expect(
      isPostPhotoUrl(`https://proj.supabase.co.evil.com/storage/v1/object/public/post-photos/${MEM}/x.jpg`),
    ).toBe(false);
  });

  it("깊이가 다른 경로를 막는다(멤버 폴더 한 겹이어야 한다)", () => {
    expect(isPostPhotoUrl(`${BASE}/${MEM}/sub/x.jpg`)).toBe(false);
    expect(isPostPhotoUrl(`${BASE}/x.jpg`)).toBe(false);
  });

  it("빈 마디를 막는다", () => {
    expect(isPostPhotoUrl(`${BASE}//x.jpg`)).toBe(false);
    expect(isPostPhotoUrl(`${BASE}/${MEM}/`)).toBe(false);
  });
});

describe("isOwnPostPhotoUrl", () => {
  it("본인 폴더면 통과한다", () => {
    expect(isOwnPostPhotoUrl(`${BASE}/${MEM}/1785244104270.jpg`, MEM)).toBe(true);
  });

  // 없으면 남이 올린 공개 URL을 자기 기록에 붙여 남의 사진을 자기 것으로 전광판에 세울 수 있다.
  it("남의 폴더면 막는다", () => {
    expect(isOwnPostPhotoUrl(`${BASE}/${OTHER}/1785244104270.jpg`, MEM)).toBe(false);
  });

  it("출처가 우리 버킷이 아니면 소유권 이전에 막힌다", () => {
    expect(isOwnPostPhotoUrl(`https://evil.example.com/${MEM}/x.jpg`, MEM)).toBe(false);
  });
});
