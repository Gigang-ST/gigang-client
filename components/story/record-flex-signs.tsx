"use client";

import { useState } from "react";
import Image from "next/image";

import { dayjs } from "@/lib/dayjs";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";

import { RecordFlexCreateDialog } from "@/components/story/record-flex-create-dialog";

import type { StoryPost } from "@/lib/queries/story-posts";

/** 팻말 기울기 — 손으로 든 것처럼 조금씩 다르게. 5개 주기로 반복 */
const TILTS = [-3, 2, -1.5, 3, -2];

/** 종목 라벨 — 마일리지런과 같은 어휘를 쓴다(자동 유입분과 표기가 갈리지 않게) */
function sportLabel(sprt: string | null): string | null {
  if (!sprt) return null;
  return MILEAGE_SPORT_LABELS[sprt as MileageSport] ?? null;
}

/** 거리 표기 — numeric이 10.20으로 와도 10.2로 줄인다(뒤 0은 정보가 아니다) */
function formatKm(km: number | null): string | null {
  if (km == null || Number.isNaN(km)) return null;
  return `${Number(km.toFixed(2))}km`;
}

/**
 * 기록 자랑 팻말 — 멤버가 올린 러닝 기록을 코스변 손팻말로 세운다.
 *
 * 판에는 사진과 한마디가, 손잡이 아래에는 이름·활동일·거리가 붙는다. 각오가 종이비행기로
 * 하늘로 옮겨가면서 비워진 팻말 형태를 여기가 물려받았다(`/dev/story-styles` K안).
 *
 * 마일리지런에서 자동 유입된 기록(`src_enm='mlg_auto'`)은 사진이 없다 — 원천
 * `evt_mlg_act_hist`에 사진 컬럼이 없기 때문. 그 경우 사진 자리를 거리로 채워 팻말이
 * 반쪽으로 보이지 않게 한다(사진 컬럼이 생기면 이 분기는 자연히 죽는다).
 *
 * **팻말은 누르는 대상이 아니다.** 예전엔 탭하면 프로필 카드가 열렸지만, 팻말이 말하는 건
 * "이 기록"이지 "이 사람"이 아니라 오독이었다(기록 목록에서 행 전체가 아니라 이름만 눌리게 한
 * 것과 같은 판단). 지금은 읽기만 하는 판이고, 자리는 다른 상세를 붙일 때 다시 연다.
 */
export function RecordFlexSigns({
  posts,
  myMemId,
}: {
  posts: StoryPost[];
  /** 로그인 사용자 — 없으면 "세우기" 버튼을 감춘다(각오·응원과 동일 정책) */
  myMemId: string | null;
}) {
  const [writing, setWriting] = useState(false);
  const hasPosts = posts.length > 0;

  return (
    <section className="flex flex-col">
      <div className="rule-section mx-6 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Course Signs
        </h2>
      </div>
      <p className="px-6 pt-2.5 font-serif text-[15px] text-muted-foreground">
        {hasPosts
          ? "코스에 꽂아둔 기록"
          : "코스가 아직 비어 있어요 — 오늘 뛴 기록을 꽂아보세요"}
      </p>

      {hasPosts && (
        <>
          {/* 코스변 — 가로만 스크롤. 회전한 팻말이 세로 스크롤을 만들지 않게 세로는 클립하고
              상하 패딩으로 잘리지 않을 여유를 준다(각오 팻말에서 쓰던 방식 그대로). */}
          <div className="mt-4 overflow-x-auto overflow-y-hidden py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-end gap-4 px-6">
              {posts.map((p, i) => {
                const label = sportLabel(p.sprt_enm);
                const km = formatKm(p.dst_km);
                return (
                  <div
                    key={p.post_id}
                    style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}
                    className="flex w-[172px] shrink-0 flex-col items-center py-1"
                  >
                    {/* 팻말 판 — 사진 + 한마디. 높이를 고정해 기울여도 이웃과 어긋나지 않게 한다 */}
                    <span className="w-full rounded-md border-[2.5px] border-foreground bg-background p-2 shadow-sm">
                      <span className="block aspect-square w-full overflow-hidden rounded-sm bg-muted">
                        {p.photo_url ? (
                          <Image
                            src={p.photo_url}
                            alt=""
                            width={320}
                            height={320}
                            className="size-full object-cover"
                            unoptimized
                          />
                        ) : (
                          // 자동 유입분 — 사진이 없으니 거리를 크게 세워 판을 채운다
                          <span className="flex size-full flex-col items-center justify-center gap-1">
                            <span className="font-numeric text-[22px] font-medium text-foreground tabular-nums">
                              {km ?? "―"}
                            </span>
                            {label && (
                              <span className="text-[10px] text-muted-foreground">
                                {label}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="mt-2 flex h-[32px] items-center justify-center overflow-hidden px-0.5 text-center font-serif text-[12px] leading-snug text-foreground">
                        <span className="line-clamp-2 break-words [word-break:break-word]">
                          {p.cmnt_txt}
                        </span>
                      </span>
                    </span>

                    {/* 손잡이 막대 */}
                    <span aria-hidden className="h-9 w-1.5 bg-foreground/70" />

                    {/* 이름 · 날짜 · 거리 */}
                    <span className="flex flex-col items-center pt-1.5 text-[10px] text-muted-foreground">
                      <span className="max-w-[172px] truncate">{p.mem_nm}</span>
                      <span className="font-numeric tabular-nums">
                        {p.act_dt && dayjs(p.act_dt).format("M.DD")}
                        {p.act_dt && km ? " · " : ""}
                        {p.photo_url ? km : null}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 지면(아스팔트) 선 — 팻말이 땅에 꽂혀 있다는 걸 한 선으로 말한다 */}
          <div className="mx-6 -mt-8 border-t-2 border-dashed border-border" />
        </>
      )}

      {/* 팻말 세우기 — 로그인 멤버만 */}
      {myMemId && (
        <div className={hasPosts ? "px-6 pt-10" : "px-6 pt-5"}>
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 기록 팻말 세우기
          </button>
        </div>
      )}

      <RecordFlexCreateDialog open={writing} onOpenChange={setWriting} />
    </section>
  );
}
