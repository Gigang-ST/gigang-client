import type { HeaderBrand } from "@/lib/team-brand";

/**
 * 일정 탭 헤더 가운데 슬로건 — 창설일 줄 + 슬로건 줄. 값은 팀 설정(`brand.founded_dt` · `brand.slogan`)이고
 * 없는 줄은 안 그린다. 예전엔 기강 문구가 여기 박혀 있어 울산 화면에도 기강 슬로건이 떴다(2026-11-10 팀 설정으로 옮김).
 *
 * **로딩 스켈레톤(`HomeHeaderSkeleton`)은 이걸 그리지 않는다.** 스켈레톤은 빌드 때 한 장 만들어 모든 주소에
 * 같은 걸 보여 주는 뼈대라 어느 팀인지 모른다 — 문구를 넣으면 그게 다른 팀 화면에 스친다. 그 자리는 같은 높이의
 * 빈칸이고(헤더는 `h-8` 칸에 가운데 정렬이라 높이가 안 튄다), 본 헤더가 오면 이 팀 문구가 채워진다.
 * 예전에 진입할 때 헤더가 튄 건 스켈레톤이 정의 안 된 CSS 변수로 16px 글자를 그렸기 때문이다 — 크기가 아니라
 * 빈칸이면 튈 일이 없다. 크기를 바꿀 땐 여기 하나만 고친다.
 */
export function HeaderSlogan({ brand }: { brand: HeaderBrand }) {
  return (
    <>
      {brand.since ? (
        <p className="font-sans text-[6px] uppercase tracking-[0.15em] text-muted-foreground">
          Since {brand.since}
        </p>
      ) : null}
      {brand.slogan ? (
        <p className="max-w-52 truncate font-sans text-[13px] font-black italic uppercase leading-tight tracking-[-0.03em] text-foreground">
          {brand.slogan}
        </p>
      ) : null}
    </>
  );
}
