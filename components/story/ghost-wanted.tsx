"use client";

import { dayjs } from "@/lib/dayjs";

import { Avatar } from "@/components/common/avatar";

import type { GhostMember } from "@/lib/queries/ghost-members";

/**
 * 현상수배 유령회원존 — 오래 안 나온 멤버를 서부영화 수배 포스터 톤으로.
 *
 * 프로필 카드의 "N일째 실종… 수배 중" 문구와 톤을 잇는다(같은 "실종" 어휘). 놀리는 게 아니라
 * "요즘 안 보이네, 나와라" 하는 크루의 애정 어린 호출이다. 포스터를 탭하면 그 사람 프로필이
 * 열려 바로 안부를 확인할 수 있다. 수배 대상이 없으면(모두 최근 활동) 존 자체를 접는다.
 *
 * 색은 앱 토큰 안에서만 쓴다(muted 배경 + 거친 이중 테두리로 낡은 포스터 느낌) — 세피아 하드코딩 없이.
 */
export function GhostWanted({
  ghosts,
  onSelectMember,
}: {
  ghosts: GhostMember[];
  onSelectMember: (memId: string, name: string) => void;
}) {
  if (ghosts.length === 0) return null;

  return (
    <section className="flex flex-col">
      <div className="rule-section mx-6 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Wanted
        </h2>
      </div>
      <p className="px-6 pt-2.5 font-serif text-[15px] text-muted-foreground">
        요즘 안 보이는 얼굴들 — 현상수배 중
      </p>

      {/* 가로 스크롤 수배 포스터들 */}
      <div className="mt-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-3 px-6">
          {ghosts.map((g) => (
            <button
              key={g.mem_id}
              type="button"
              onClick={() => onSelectMember(g.mem_id, g.mem_nm)}
              aria-label={`${g.mem_nm} · ${g.days_ago}일째 실종 · 프로필 보기`}
              className="flex w-[128px] shrink-0 flex-col items-center gap-2 rounded-sm border-2 border-double border-foreground/70 bg-muted/40 px-3 py-3 text-center transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              <span className="font-numeric text-[11px] font-bold uppercase tracking-[0.24em] text-foreground">
                Wanted
              </span>
              <span className="grayscale">
                <Avatar
                  src={g.avatar_url}
                  seed={g.mem_id}
                  alt={g.mem_nm}
                  size="lg"
                />
              </span>
              <span className="truncate text-[14px] font-bold text-foreground">
                {g.mem_nm}
              </span>
              <span className="font-numeric text-[11px] font-semibold text-destructive tabular-nums">
                {g.days_ago}일째 실종
              </span>
              <span className="font-numeric text-[10px] text-muted-foreground tabular-nums">
                최종 목격 {dayjs(g.last_actv_dt).format("YY.M.DD")}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
