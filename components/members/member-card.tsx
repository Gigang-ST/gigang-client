import {
  getJoinPurposeLabelsFromCds,
  getRunningProfileRows,
} from "@/lib/member-card";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { PurposeChip } from "@/components/members/profile-chip";
import { CardItem } from "@/components/ui/card";

import type { MemberCardCompactData } from "@/lib/queries/member-card";

/**
 * 컴팩트 프로필 카드 — "이 사람이 누구인지"를 한 장에. 신규 멤버 목록이 쓴다.
 *
 * 상세 카드가 "이 사람의 실적"(기록·칭호 목록·최근활동)이라면 이쪽은 자기소개다.
 * 그래서 기록·수치는 넣지 않는다 — 실적이 아직 없는 신규 멤버도 채워지는 카드여야 한다.
 *
 * **리드 새 얼굴 슬롯과 같은 화법을 쓴다**: 러닝 프로필은 도트리더 행(라벨 ···· 값),
 * 가입목적은 라벨을 윗줄에 세우고 아랫줄에 한마디+칩. 아이콘 칩(`getRunningProfileChips`)이
 * 아니라 행(`getRunningProfileRows`)인 이유는 §lib/member-card.ts에 적힌 그대로다 — 칩은
 * 폭이 좁은 목록용이고, **처음 보는 사람을 소개하는 자리**에서 `⏱ 6'00"`만 있으면 그게
 * 평균인지 최고기록인지 알 수 없다. 이 섹션이 바로 그 자리다.
 *
 * **소개 한마디(`intro_txt`)는 그리지 않는다.** 가입 위저드에 그 항목이 없어(온보딩 스키마는
 * `joinPurpTxt`만 받는다) 신규 멤버는 항상 비어 있고, 빈 자리를 기본 문구로 채우면 가입목적
 * 한마디와 나란히 **말이 두 개** 서게 된다. 이 카드에서 사람의 말은 가입목적 하나다.
 * (나중에 본인이 `IntroEditDialog`로 쓴 한마디는 상세 카드가 보여준다.)
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
  /**
   * 이름 아래 슬롯 — 목록마다 다른 맥락 정보(신규멤버는 가입일).
   * 카드 우측 상단이 아니라 이름 스택 안에 붙는다: 오른쪽은 러닝 프로필 행이 쓰고,
   * 거기에 3단째를 끼우면 이름 칸이 30px로 눌려 이름이 잘린다.
   */
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

  const rows = getRunningProfileRows(data.running_profile);
  // 한마디와 칩을 **둘 다** 싣는다 — 직접 쓴 사람도 칩을 함께 고르고, 고른 것과 쓴 것은
  // 다른 정보다(`getJoinPurposeLabels`는 한마디가 있으면 칩을 버리므로 쓰지 않는다).
  const purposes = getJoinPurposeLabelsFromCds(
    data.running_profile?.join_purp_cds,
  );
  const purposeTxt = data.running_profile?.join_purp_txt?.trim() || null;

  const hasPurpose = Boolean(purposeTxt) || purposes.length > 0;
  // 가입 직후라 아무것도 안 채운 사람 — 빈 칸을 둘로 쪼개 각각 "비어 있어요"라고 적으면
  // 없다는 말만 두 번 한다. 한 문장으로 합쳐 받는다(리드 새 얼굴 슬롯과 같은 처리).
  const blank = rows.length === 0 && !hasPurpose;

  const body = (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {/* 헤더 — 왼쪽 인물(아바타·이름·칭호·가입일), 오른쪽 러닝 프로필 도트리더 */}
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar
            src={data.avatar_url}
            seed={memId}
            alt={data.mem_nm}
            size="lg"
          />
          {/* 이름·칭호·가입일을 세로로 쌓고 가로 가운데 정렬 — 칭호 배지가 이름보다 넓어도
              이름이 배지 폭 한가운데에 온다(왼쪽 정렬이면 이름이 왼쪽으로 쏠려 보인다). */}
          <div className="flex min-w-0 flex-col items-center gap-1">
            <span className="max-w-full truncate text-[15px] font-bold text-foreground">
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
            {meta}
          </div>
        </div>

        {/* 러닝 프로필 — 상세 카드·리드와 같은 도트리더 행(라벨 ···· 값). 폭이 좁아
            점선은 min-w-2까지 줄어들되, 라벨과 값이 양끝에 붙어 "무엇이 얼마인지"가
            눈으로 이어진다. 한쪽만 비면 자리를 비우지 않고 그 사실을 적는다 — 그냥 비우면
            오른쪽이 휑해 레이아웃이 깨진 것처럼 보이고, 읽는 사람도 로딩 중인가 하고 기다린다. */}
        {rows.length > 0 ? (
          <ul className="flex w-[132px] shrink-0 flex-col gap-1">
            {rows.map((row) => (
              <li key={row.label} className="flex items-baseline gap-1.5">
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {row.label}
                </span>
                <span
                  aria-hidden
                  className="min-w-2 flex-1 -translate-y-0.5 border-b border-dashed border-border"
                />
                <span className="shrink-0 font-numeric text-[11px] text-foreground tabular-nums">
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          !blank && (
            <span className="w-[132px] shrink-0 text-right text-[11px] leading-relaxed text-muted-foreground/70">
              러닝 프로필은
              <br />
              아직 비어 있어요
            </span>
          )
        )}
      </div>

      {/* 가입목적 — 라벨을 윗줄에 세우고 내용을 아랫줄에. 칩이든 한마디든 "무엇에 대한
          답인지"가 먼저 읽히게 한다. 한마디는 **최대 두 줄**에서 자르고 넘치면 …:
          `join_purp_txt`는 500자까지 허용되는 자유 입력이라 한 줄 truncate로는 첫 어절만
          남는 경우가 있고, 목록 카드에서 세 줄을 주면 카드끼리 높이가 크게 벌어진다. */}
      {!blank && (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            가입목적
          </span>
          {purposeTxt && (
            <span className="line-clamp-2 text-[13px] leading-relaxed text-foreground">
              “{purposeTxt}”
            </span>
          )}
          {purposes.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {purposes.map((label) => (
                <PurposeChip key={label} label={label} />
              ))}
            </div>
          )}
          {/* 가입목적만 없는 경우 — 라벨은 세워두고 값 자리에 그 사실을 적는다. */}
          {!hasPurpose && (
            <span className="text-[13px] leading-relaxed text-muted-foreground/70">
              아직 적지 않았어요
            </span>
          )}
        </div>
      )}

      {/* 전부 빈 사람 — **단정하지 않는다**: 프로필이 비었다는 건 "러닝 경험이 적다"의
          증거가 아니다(빠른 러너가 폼만 안 채웠을 수도 있다). "일지도 몰라요"로 여지를 두고
          크루가 할 일(먼저 인사)로 문장을 닫아, 빈 칸을 설명이 아니라 초대로 쓴다. */}
      {blank && (
        <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
          러닝 프로필이 비어 있어요. 이제 막 달리기를 시작한 새내기일지도 몰라요
          — 만나면 먼저 인사 건네주세요.
        </p>
      )}
    </div>
  );

  const cls = cn("flex w-full text-left", frameCls, className);

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
