"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { PledgeCreateDialog } from "@/components/story/pledge-create-dialog";

import type { StoryPledge } from "@/lib/queries/story-feed";

/** 팻말 기울기 — 손으로 든 것처럼 조금씩 다르게. 5개 주기로 반복 */
const TILTS = [-3, 2, -1.5, 3, -2];

/**
 * 코스 응원 팻말 — 멤버 각오를 마라톤 코스변 손팻말로 세운다.
 *
 * 기강이야기 상단(기상대 바로 아래)에 놓인다. 각오는 만료 없이 쌓이고(최근 8건 노출),
 * 가로로 밀어 지나가는 게 곧 코스를 달리는 감각이다. 팻말을 탭하면 그 사람 프로필이 열리고,
 * "내 팻말 만들어 꽂기"로 로그인 멤버 누구나 한 줄 다짐을 남긴다.
 *
 * `/dev/story-styles`의 K안 시안을 실데이터로 옮긴 것 — 재료(명조 손글씨·손잡이 막대·아스팔트
 * 점선)는 시안 그대로 두고, mock을 `feed.pledges`로, 버튼을 실제 작성 다이얼로그로 바꿨다.
 */
export function PledgeSigns({
  pledges,
  myMemId,
  onSelectMember,
}: {
  pledges: StoryPledge[];
  /** 로그인 사용자 — 없으면 "꽂기" 버튼을 로그인 유도로 바꾸지 않고 그냥 감춘다 */
  myMemId: string | null;
  onSelectMember: (memId: string, name: string) => void;
}) {
  const [writing, setWriting] = useState(false);
  const hasPledges = pledges.length > 0;

  return (
    <section className="flex flex-col">
      <div className="rule-section mx-6 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Course Signs
        </h2>
      </div>
      <p className="px-6 pt-2.5 font-serif text-[15px] text-muted-foreground">
        {hasPledges
          ? "코스에 꽂아둔 각오 — 옆으로 밀어 지나가세요"
          : "코스가 아직 비어 있어요 — 첫 각오를 꽂아보세요"}
      </p>

      {hasPledges && (
        <>
          {/* 코스변 — 가로만 스크롤. 팻말은 손으로 든 것처럼 조금씩 기울어 있다.
              회전한 팻말이 위아래로 삐져나와 세로 스크롤이 생기지 않게 세로는 클립하고
              상하 패딩(py-3)으로 잘리지 않을 여유를 준다. */}
          <div className="mt-4 overflow-x-auto overflow-y-hidden py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-end gap-4 px-6">
              {pledges.map((p, i) => (
                <button
                  key={p.pldg_id}
                  type="button"
                  onClick={() => onSelectMember(p.mem_id, p.mem_nm)}
                  aria-label={`${p.mem_nm}의 각오 · 프로필 보기`}
                  style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}
                  className="flex w-[150px] shrink-0 flex-col items-center py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                >
                  {/* 팻말 판 — 손글씨 느낌을 명조로. 긴 각오는 판 안에서 줄바꿈(break-words로
                      띄어쓰기 없는 긴 문자열도 강제로 끊어) 넘치면 3줄까지 말줄임. 고정 높이라
                      기울여도 이웃 팻말과 어긋나지 않는다. */}
                  <span className="flex h-[84px] w-full items-center justify-center overflow-hidden rounded-md border-[2.5px] border-foreground bg-background px-2.5 py-2 text-center font-serif text-[13px] leading-snug text-foreground shadow-sm">
                    <span className="line-clamp-3 break-words [word-break:break-word]">
                      {p.pldg_txt}
                    </span>
                  </span>
                  {/* 손잡이 막대 */}
                  <span aria-hidden className="h-9 w-1.5 bg-foreground/70" />
                  <span className="pt-1.5 text-[10px] text-muted-foreground">
                    {p.mem_nm}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 지면(아스팔트) 선 — 팻말이 땅에 꽂혀 있다는 걸 한 선으로 말한다 */}
          <div className="mx-6 -mt-8 border-t-2 border-dashed border-border" />
        </>
      )}

      {/* 각오 꽂기 — 로그인 멤버만. 비로그인에겐 버튼을 감춘다(응원·내역과 동일 정책) */}
      {myMemId && (
        <div className={cn("px-6", hasPledges ? "pt-10" : "pt-5")}>
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 팻말 만들어 꽂기
          </button>
        </div>
      )}

      <PledgeCreateDialog open={writing} onOpenChange={setWriting} />
    </section>
  );
}
