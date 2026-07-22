import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { CardItem } from "@/components/ui/card";

import type { MemberCardData } from "@/lib/queries/member-card";

/**
 * 컴팩트 프로필 카드 — 전광판 스포트라이트·피드 인라인용.
 *
 * 기록·숫자는 넣지 않는다: 전광판에서는 이유 배너가 헤드라인·숫자를 얹으므로 중복이 된다.
 * 수치 정보는 상세 카드의 몫.
 * 순수 표현 컴포넌트 — 데이터는 props로만 받는다(피드 RPC가 payload를 내려주면 fetch 없이 그린다).
 */
export function MemberCardCompact({
  memId,
  data,
  className,
}: {
  /** 폴백 아바타 seed — 앱 전체가 mem_id로 통일 */
  memId: string;
  data: MemberCardData;
  className?: string;
}) {
  const frameCls = getFrameCls(data.frame_cd);

  return (
    <CardItem className={cn("flex items-center gap-3", frameCls, className)}>
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
              tooltip={{
                desc: data.primary_title.ttl_desc,
                visibility: data.primary_title.desc_visibility,
                isHeld: true,
              }}
            />
          )}
        </div>
        {data.intro_txt && (
          <span className="truncate text-[13px] text-muted-foreground">
            {data.intro_txt}
          </span>
        )}
      </div>
    </CardItem>
  );
}
