"use client";

import { forwardRef } from "react";

import Image from "next/image";

import { UserRound } from "lucide-react";

import { secondsToTime } from "@/lib/dayjs";
import {
  isUtmbFeatured,
  resolveCardRecords,
  sportLabel,
  SPORT_DOT_CLASS,
  type MemberCardData,
} from "@/lib/member-card";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { TitleBadge } from "@/components/common/title-badge";

/**
 * 기록 카드 본체(순수 표현). 랭킹 팝업·본인 카드·이미지 캡처가 공유한다.
 * 테마(라이트/다크)는 상위 앱 테마를 그대로 따른다.
 */
export const RecordCard = forwardRef<HTMLDivElement, {
  data: MemberCardData;
  /** 이미지 캡처용 아바타 override (dataURL). 없으면 data.avatar_url 사용 */
  avatarSrc?: string | null;
  className?: string;
}>(function RecordCard({ data, avatarSrc, className }, ref) {
  const frameCls = getFrameCls(data.frame_cd);
  const records = resolveCardRecords(data.best_records, data.card_featured);
  const utmbShown = isUtmbFeatured(data.utmb_index, data.card_featured);
  const avatar = avatarSrc ?? data.avatar_url;

  return (
    <div
      ref={ref}
      className={cn(
        "w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground",
        frameCls,
        className,
      )}
    >
      {/* 히어로 사진 (풀블리드) */}
      <div className="relative aspect-[4/5] w-full bg-secondary">
        {avatar ? (
          <Image
            src={avatar}
            alt={`${data.mem_nm} 프로필 사진`}
            fill
            sizes="340px"
            className="object-cover"
            referrerPolicy="no-referrer"
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <UserRound className="size-20 text-foreground/30" />
          </div>
        )}
        {/* 하단 그라디언트 + 이름/칭호 */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10">
          <span className="text-xl font-bold text-white">{data.mem_nm}</span>
          {data.primary_title && (
            <span className="flex">
              <TitleBadge
                name={data.primary_title.ttl_nm}
                effect={data.badge_effect}
                size="sm"
              />
            </span>
          )}
        </div>
      </div>

      {/* 선택 기록 목록 */}
      <div className="flex flex-col px-4 py-3">
        {records.length === 0 && !utmbShown ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            아직 등록된 기록이 없습니다.
          </p>
        ) : (
          <>
            {records.map((r) => (
              <div
                key={`${r.sport}-${r.evt}`}
                className="flex items-center justify-between border-b border-border/60 py-2 last:border-b-0"
              >
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    className={cn(
                      "inline-block size-2 rounded-full",
                      SPORT_DOT_CLASS[r.sport] ?? "bg-muted-foreground",
                    )}
                  />
                  {sportLabel(r.sport)} · {r.evt}
                </span>
                <span className="font-mono text-sm font-bold text-foreground">
                  {secondsToTime(r.rec_time_sec)}
                </span>
              </div>
            ))}
            {utmbShown && (
              <div className="flex items-center justify-between border-b border-border/60 py-2 last:border-b-0">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={cn("inline-block size-2 rounded-full", SPORT_DOT_CLASS.trail_run)} />
                  트레일 · UTMB
                </span>
                <span className="font-mono text-sm font-bold text-foreground">
                  {data.utmb_index}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
