"use client";

import { useRef, useState } from "react";
import Image from "next/image";

import { dayjs } from "@/lib/dayjs";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
import { cn } from "@/lib/utils";

import { RecordFlexCreateDialog } from "@/components/story/record-flex-create-dialog";

import type { StoryPost } from "@/lib/queries/story-posts";
import type { PointerEvent } from "react";

/**
 * 한 면에 싣는 장수 — 2x2.
 *
 * 3x3(9칸)도 검토했지만 375px 화면에서 칸당 ~105px이라 폴라로이드 하단(한마디·이름·날짜)이
 * 사실상 안 들어간다. 2x2면 칸당 ~160px로 한마디가 두 줄까지 읽힌다. 폴라로이드는 사진 아래
 * 여백에 글이 있어야 폴라로이드고, 그게 없으면 그냥 사진 격자다.
 */
const PER_PAGE = 4;

/** 폴라로이드 기울기 — 책상에 흩어놓은 것처럼 조금씩. 4개 주기(한 면 장수)와 어긋나게 5개 */
const TILTS = [-2, 1.5, -1, 2];

/** 스와이프 판정 — 가로 이동이 세로보다 크고 이만큼 넘으면 한 면 */
const SWIPE_PX = 40;

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
 * 기록 자랑 — 폴라로이드 피드.
 *
 * 사진 아래 흰 여백에 한마디·이름·날짜·거리가 앉는 폴라로이드 형태로, 2x2 한 면씩 옆으로 밀어
 * 과거 기록을 본다. 인스타 피드의 격자에 폴라로이드의 "사진 아래 손글씨"를 얹은 것 — 격자만
 * 있으면 누가 언제 뛴 건지가 사진 밖으로 밀려나고, 한마디가 사라지면 기록이 아니라 앨범이 된다.
 *
 * 페이지는 세로로 흐르지 않는다. 한 면은 항상 2x2 고정 높이라, 마지막 면이 한 장뿐이어도
 * 지면이 출렁이지 않는다(리드 스와이프와 같은 판단 — 넘길 때 높이가 바뀌면 읽던 위치를 잃는다).
 *
 * 마일리지런에서 자동 유입된 기록(`src_enm='mlg_auto'`)은 사진이 없다 — 원천
 * `evt_mlg_act_hist`에 사진 컬럼이 없기 때문. 그 경우 사진 자리를 거리로 채워 폴라로이드가
 * 반쪽으로 보이지 않게 한다(사진 컬럼이 생기면 이 분기는 자연히 죽는다).
 */
export function RecordFlexFeed({
  posts,
  myMemId,
}: {
  posts: StoryPost[];
  /** 로그인 사용자 — 없으면 "올리기" 버튼을 감춘다(각오·응원과 동일 정책) */
  myMemId: string | null;
}) {
  const [writing, setWriting] = useState(false);
  const [page, setPage] = useState(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const hasPosts = posts.length > 0;
  const pageCount = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  // 데이터가 줄어 현재 면이 사라진 경우(Realtime 갱신 등)를 위해 한 번 더 조인다
  const active = Math.min(page, pageCount - 1);
  const shown = posts.slice(active * PER_PAGE, active * PER_PAGE + PER_PAGE);

  /** 스와이프 — 왼쪽으로 밀면 과거(다음 면), 오른쪽으로 밀면 최근(이전 면) */
  function handlePointerUp(e: PointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    // 끝에서는 감기지 않는다 — 목록에 끝이 있다는 걸 손으로 알 수 있게(리드 배너와 다른 점:
    // 저긴 소식 순환이고 여긴 시간순 목록이다)
    setPage((p) => Math.min(pageCount - 1, Math.max(0, p + (dx < 0 ? 1 : -1))));
  }

  return (
    <section className="flex flex-col">
      <div className="rule-section mx-6 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Record Flex
        </h2>
      </div>
      <p className="px-6 pt-2.5 font-serif text-[15px] text-muted-foreground">
        {hasPosts
          ? "기강인들이 남긴 기록"
          : "아직 올라온 기록이 없어요 — 오늘 뛴 기록을 남겨보세요"}
      </p>

      {hasPosts && (
        <div
          onPointerDown={(e) => {
            dragStart.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
          }}
          className="touch-pan-y select-none px-6 pt-4"
        >
          {/* key에 면 번호를 넣어 넘길 때마다 등장 모션이 다시 걸린다(리드와 같은 장치) */}
          <ul key={active} className="lede-in grid grid-cols-2 gap-3">
            {shown.map((p, i) => {
              const label = sportLabel(p.sprt_enm);
              const km = formatKm(p.dst_km);
              return (
                <li
                  key={p.post_id}
                  style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}
                  className="flex flex-col rounded-[2px] border border-border bg-background p-2 pb-2.5 shadow-sm"
                >
                  {/* 사진 — 폴라로이드는 정사각. 아래 여백이 글자리라 여기서 비율을 고정한다 */}
                  <span className="block aspect-square w-full overflow-hidden bg-muted">
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
                        <span className="font-numeric text-[20px] font-medium text-foreground tabular-nums">
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

                  {/* 폴라로이드 하단 여백 — 한마디가 손글씨 자리다.
                      높이를 고정해 한마디 길이가 달라도 격자가 어긋나지 않게 한다. */}
                  <span className="mt-2 flex h-[30px] items-start justify-center overflow-hidden px-0.5 text-center font-serif text-[11px] leading-snug text-foreground">
                    <span className="line-clamp-2 break-words [word-break:break-word]">
                      {p.cmnt_txt}
                    </span>
                  </span>

                  {/* 이름 · 날짜 · 거리 */}
                  <span className="flex flex-col items-center gap-0.5 pt-1 text-[10px] text-muted-foreground">
                    <span className="w-full truncate text-center">{p.mem_nm}</span>
                    <span className="font-numeric tabular-nums">
                      {p.act_dt && dayjs(p.act_dt).format("M.DD")}
                      {p.act_dt && p.photo_url && km ? " · " : ""}
                      {p.photo_url ? km : null}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* 면 표시 — 리드의 진행 막대와 같은 어휘. 눌러서 바로 그 면으로도 간다 */}
          {pageCount > 1 && (
            <div className="flex items-center gap-2 pt-4">
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`${i + 1}번째 면 보기`}
                  aria-current={i === active}
                  className="group flex-1 py-2 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "block h-0.5 w-full transition-colors",
                      i === active
                        ? "bg-foreground"
                        : "bg-border group-hover:bg-muted-foreground",
                    )}
                  />
                </button>
              ))}
            </div>
          )}

          <span className="sr-only" role="status">
            {pageCount}면 중 {active + 1}면
          </span>
        </div>
      )}

      {/* 기록 올리기 — 로그인 멤버만 */}
      {myMemId && (
        <div className={hasPosts ? "px-6 pt-4" : "px-6 pt-5"}>
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 기록 올리기
          </button>
        </div>
      )}

      <RecordFlexCreateDialog open={writing} onOpenChange={setWriting} />
    </section>
  );
}
