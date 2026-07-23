import { getMemberIntro, getRunningProfileLine } from "@/lib/member-card";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { CardItem } from "@/components/ui/card";

import type { MemberCardCompactData } from "@/lib/queries/member-card";

/**
 * 컴팩트 프로필 카드 — "이 사람이 누구인지"를 한 장에.
 *
 * 상세 카드가 "이 사람의 실적"(기록·칭호 목록·최근활동)이라면 이쪽은 자기소개다.
 * 그래서 기록·수치는 넣지 않고 한마디와 러닝 프로필을 싣는다 — 실적이 아직 없는
 * 신규 멤버도 채워지는 카드여야 하기 때문이다.
 *
 * 순수 표현 컴포넌트 — 데이터는 props로만 받는다(피드 RPC가 payload를 내려주면 fetch 없이 그린다).
 * props가 `MemberCardCompactData`(좁힌 표면)라 상세 카드 payload 없이도 그릴 수 있다.
 */
export function MemberCardCompact({
  memId,
  data,
  meta,
  onSelect,
  className,
}: {
  /** 폴백 아바타 seed — 앱 전체가 mem_id로 통일 */
  memId: string;
  data: MemberCardCompactData;
  /** 우측 상단 슬롯 — 목록마다 다른 맥락 정보(신규멤버는 가입일) */
  meta?: React.ReactNode;
  /**
   * 카드 전체를 누를 수 있게 만든다(보통 상세 카드 열기).
   * 이때 칭호 배지의 툴팁은 끈다 — 툴팁이 있으면 배지가 `<button>`이 되어 버튼이 중첩된다.
   * 설명은 어차피 상세 카드에서 볼 수 있다.
   */
  onSelect?: () => void;
  className?: string;
}) {
  const frameCls = getFrameCls(data.frame_cd);
  const clickable = onSelect != null;

  // 러닝 프로필이 비어 있으면 가입 목적 칩으로 대신한다 — 온보딩만 마친 멤버도 한 줄은 채워진다.
  const intro = getMemberIntro(data.running_profile);
  const profileLine =
    getRunningProfileLine(data.running_profile) ??
    (intro && intro.purposes.length > 0 ? intro.purposes.join(" · ") : null);

  const body = (
    <>
      <Avatar src={data.avatar_url} seed={memId} alt={data.mem_nm} size="lg" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-bold text-foreground">
            {data.mem_nm}
          </span>
          {data.primary_title && (
            <TitleBadge
              name={data.primary_title.ttl_nm}
              effect={data.badge_effect}
              size="xs"
              tooltip={
                clickable
                  ? undefined
                  : {
                      desc: data.primary_title.ttl_desc,
                      visibility: data.primary_title.desc_visibility,
                      isHeld: true,
                    }
              }
            />
          )}
        </div>

        {data.intro_txt && (
          <span className="truncate text-[13px] text-muted-foreground">
            {data.intro_txt}
          </span>
        )}

        {profileLine && (
          <span className="truncate font-numeric text-[12px] text-muted-foreground tabular-nums">
            {profileLine}
          </span>
        )}
      </div>

      {meta && <div className="shrink-0 self-start">{meta}</div>}
    </>
  );

  const cls = cn("flex w-full items-start gap-3 text-left", frameCls, className);

  if (clickable) {
    return (
      <CardItem asChild className={cls}>
        <button
          type="button"
          onClick={onSelect}
          aria-label={`${data.mem_nm} 프로필 보기`}
          className="transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
        >
          {body}
        </button>
      </CardItem>
    );
  }

  return <CardItem className={cls}>{body}</CardItem>;
}
