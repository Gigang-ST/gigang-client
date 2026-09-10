import { Avatar } from "@/components/common/avatar";
import { Body, Caption, Micro } from "@/components/common/typography";

import { sortWaitlist } from "@/lib/gathering/waitlist";

export type WaitlistMember = {
  mem_id: string;
  wait_at: string;
  mem_nm: string | null;
  avatar_url: string | null;
};

/**
 * 대기 명단 — 참석자 목록과 취소자 목록 사이에 선다.
 *
 * 순번을 숫자로 적는다. 대기열의 핵심 약속이 "선착순"이라, 줄만 보여주고 순번을
 * 감추면 그 약속을 확인할 방법이 없다.
 *
 * 비어 있으면 아무것도 그리지 않는다 — 대기자가 없는 게 정상이고, 빈 칸을 세우면
 * "대기해야 하는 모임"처럼 읽힌다.
 *
 * `components/schedule/`에 둔 이유: 일정탭 다이얼로그(`gathering-detail-dialog.tsx`)가
 * 같은 컴포넌트를 재사용한다 — 라우트 폴더에 두면 두 벌로 복사돼 순번 표기가 한쪽만
 * 바뀌는 사고가 난다.
 */
export function GatheringWaitlist({ entries }: { entries: WaitlistMember[] }) {
  if (entries.length === 0) return null;

  const ordered = sortWaitlist(entries);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <Body className="font-semibold">대기</Body>
        <Caption>{ordered.length}명</Caption>
      </div>

      <ul className="flex flex-col gap-2">
        {ordered.map((m, i) => (
          <li key={m.mem_id} className="flex items-center gap-3">
            <Micro className="w-5 shrink-0 text-right tabular-nums">{i + 1}</Micro>
            <Avatar src={m.avatar_url} seed={m.mem_id} alt={m.mem_nm ?? ""} size="sm" />
            <Body>{m.mem_nm ?? ""}</Body>
          </li>
        ))}
      </ul>
    </div>
  );
}
