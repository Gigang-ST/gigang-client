import Image from "next/image";

import { Avatar } from "@/components/common/avatar";
import { CardItem } from "@/components/ui/card";
import { dayjs } from "@/lib/dayjs";
import { formatRecapKm, type RecapMemory } from "@/lib/mileage-recap";
import { getSportEmoji } from "@/lib/sport";
import { cn } from "@/lib/utils";

/** "6월 14일 · 🏃 10km" — 날짜와 그날 운동 한 줄 */
export function memoryMeta(m: RecapMemory): string {
  return [
    dayjs(m.act_dt).format("M월 D일"),
    [getSportEmoji(m.sport), m.km > 0 ? formatRecapKm(m.km) : null].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 옛 필름카메라가 사진 구석에 찍던 주황 날짜('26 6 14). 사진 위에만 얹는다.
 * 시즌 사진이 "그때 그날"로 읽히게 하는 장치다.
 */
function FilmDate({ date, className }: { date: string; className?: string }) {
  return (
    <span
      className={cn(
        "film-date pointer-events-none absolute font-numeric font-medium tracking-wider text-warning tabular-nums",
        className,
      )}
    >
      {dayjs(date).format("'YY M D")}
    </span>
  );
}

/**
 * 추억 한 장 — 폴라로이드처럼 흰 테두리 안에 사진(또는 한마디), 아래에 그날의 말과 사람.
 *
 * **크기와 상관없이 같은 모양**이라 슬라이드쇼·시상식·나의 시즌·마지막 날이 같은 물건으로 읽힌다.
 * 사진이 없는 한마디는 사진 자리에 글을 크게 세운다 — 사진 칸 높이가 장마다 달라지면 넘길 때
 * 아래 버튼이 위아래로 튄다.
 */
export function RecapMemoryCard({
  memory,
  size = "lg",
  showMeta = true,
  className,
}: {
  memory: RecapMemory;
  size?: "lg" | "sm";
  /** 날짜·운동 줄 — 좁은 칸(마지막 날 3열)에선 이름만 남긴다(같은 날이라 날짜도 겹친다) */
  showMeta?: boolean;
  className?: string;
}) {
  const lg = size === "lg";
  const caption = memory.photo_url ? memory.text : null;

  return (
    <CardItem className={cn("flex flex-col bg-card", lg ? "gap-3 p-3 pb-4" : "gap-2 p-2 pb-2.5", className)}>
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden",
          lg ? "rounded-lg" : "rounded-md",
          memory.photo_url ? "bg-muted" : "bg-secondary",
        )}
      >
        {memory.photo_url ? (
          <>
            <Image
              src={memory.photo_url}
              alt={`${memory.person.mem_nm} 님의 기록 사진`}
              width={lg ? 720 : 240}
              height={lg ? 720 : 240}
              className="size-full object-cover"
              referrerPolicy="no-referrer"
              unoptimized
            />
            <FilmDate
              date={memory.act_dt}
              className={lg ? "bottom-2 right-3 text-[14px]" : "bottom-1 right-1.5 text-[10px]"}
            />
          </>
        ) : (
          <div className={cn("flex size-full items-center justify-center", lg ? "p-6" : "p-2.5")}>
            <p
              className={cn(
                "text-pretty break-keep text-center leading-relaxed text-foreground [overflow-wrap:anywhere]",
                lg ? "line-clamp-[9] text-[20px]" : "line-clamp-5 text-[12px]",
              )}
            >
              “{memory.text}”
            </p>
          </div>
        )}
      </div>

      {/* 한마디 칸 — 큰 카드는 **한마디가 있든 없든 2줄 높이를 늘 잡아 둔다**(넘치면 …).
          슬라이드쇼에서 장마다 높이가 달라지면 아래 버튼이 위아래로 튀어, 누르려던 손가락이
          엉뚱한 데를 누른다. 한마디가 없는 장(사진만, 또는 사진 자리에 글을 세운 장)은 빈칸으로 둔다.
          높이는 줄 높이 × 2(`1.625em × 2`) — 글자 크기를 바꿔도 같이 따라간다. */}
      {lg ? (
        <p className="line-clamp-2 h-[3.25em] break-keep px-1 text-[15px] leading-[1.625] text-foreground [overflow-wrap:anywhere]">
          {caption}
        </p>
      ) : (
        caption && (
          <p className="line-clamp-2 break-keep px-1 text-[12px] leading-snug text-foreground [overflow-wrap:anywhere]">
            {caption}
          </p>
        )
      )}

      <div className={cn("flex min-w-0 items-center gap-1.5", lg ? "px-1" : "px-0.5")}>
        <Avatar
          src={memory.person.avatar_url}
          seed={memory.person.mem_id}
          alt={memory.person.mem_nm}
          size="xs"
        />
        <span
          className={cn(
            "truncate font-semibold text-foreground",
            showMeta && "shrink-0",
            lg ? "text-[13px]" : "text-[11px]",
          )}
        >
          {memory.person.mem_nm}
        </span>
        {showMeta && (
          <span
            className={cn(
              "min-w-0 truncate font-numeric text-muted-foreground tabular-nums",
              lg ? "text-[12px]" : "text-[10px]",
            )}
          >
            {memoryMeta(memory)}
          </span>
        )}
      </div>
    </CardItem>
  );
}

/**
 * 추억 한 줄 — 시상식에서 상 아래 "그 사람이 남긴 한 장"을 곁들일 때.
 *
 * 폴라로이드(`RecapMemoryCard`)를 상 카드 안에 또 넣으면 카드 속 카드가 되어 무겁고, 반칸
 * 폴라로이드는 옆이 텅 빈다. 상은 숫자가 주인공이고 추억은 거드는 자리라 한 줄로 눕힌다 —
 * 왼쪽 썸네일(사진, 없으면 따옴표), 오른쪽 한마디(없으면 그날 운동).
 */
export function RecapMemorySnippet({ memory }: { memory: RecapMemory }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-secondary p-2.5">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-background">
        {memory.photo_url ? (
          <>
            <Image
              src={memory.photo_url}
              alt={`${memory.person.mem_nm} 님의 기록 사진`}
              width={128}
              height={128}
              className="size-full object-cover"
              referrerPolicy="no-referrer"
              unoptimized
            />
            <FilmDate date={memory.act_dt} className="bottom-0.5 right-1 text-[9px]" />
          </>
        ) : (
          <span
            aria-hidden
            className="flex size-full items-center justify-center font-numeric text-[28px] leading-none text-muted-foreground"
          >
            “
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 break-keep text-[13px] leading-snug text-foreground [overflow-wrap:anywhere]">
          {memory.text ? `“${memory.text}”` : memoryMeta(memory)}
        </p>
        <span className="truncate text-[11px] text-muted-foreground">
          {memory.person.mem_nm}
          {memory.text && ` · ${memoryMeta(memory)}`}
        </span>
      </div>
    </div>
  );
}
