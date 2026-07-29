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
 * **라벨은 전부 값과 같은 줄에서 시작한다** — 러닝 프로필은 도트리더 행(라벨 ···· 값),
 * 가입목적은 라벨 옆에 칩 나열 또는 직접 쓴 한마디(점선 없이). 값의 성격이 달라 연결
 * 방식만 갈린다: 앞은 1:1로 맞물리는 표, 뒤는 개수가 정해지지 않은 나열이라 점선이
 * 오히려 흐트러져 보인다.
 * (리드 새 얼굴 슬롯은 264px 고정이라 사정이 다르다 — 거긴 라벨을 윗줄에 세워도 남는
 * 높이가 어차피 여백으로 간다.) 아이콘 칩(`getRunningProfileChips`)이
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
  const purposeTxt = data.running_profile?.join_purp_txt?.trim() || null;
  // 직접 쓴 한마디가 있으면 칩은 아예 뽑지 않는다 — 렌더가 어차피 문장만 그린다.
  const purposes = purposeTxt
    ? []
    : getJoinPurposeLabelsFromCds(data.running_profile?.join_purp_cds);

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

      {/* 가입목적 — **라벨을 눕혀 칩과 한 줄에 세운다**. 이 카드는 고정 높이가 아니라
          줄이 줄면 카드가 실제로 짧아진다(목록에 6장이 쌓이는 자리다). 라벨을 윗줄에
          세우던 때는 칩을 1~2개만 고른 사람 — 대다수다 — 에게서 라벨 한 줄과 칩 한 줄이
          두 행을 쓰면서 정작 실린 정보는 단어 하나였다.

          **직접 쓴 한마디가 있으면 그 문장만 싣고 칩은 버린다.** 칩은 보기에서 고른
          근사값이고 한마디는 본인이 직접 쓴 말이라, 같은 질문("왜 들어왔나")에 대한 답이
          둘일 이유가 없다 — 나란히 두면 정확한 쪽(문장)이 고른 쪽(칩)에 묻힌다.
          `lib/member-card.ts`의 `MemberIntro.purposeTxt`가 원래부터 정한 규칙이다.

          **도트리더는 쓰지 않는다.** 위 러닝 프로필은 라벨과 값이 1:1로 맞물리는 표라
          점선이 "이 라벨의 값은 이것"을 이어 주지만, 칩은 개수가 정해지지 않은 나열이다.
          점선을 깔면 칩이 오른쪽 끝으로 밀려 라벨과 멀어지고, 개수에 따라 점선 길이가
          들쭉날쭉해 표가 흐트러진 것처럼 보인다.

          **한마디도 칩과 같은 줄에서 시작한다.** 라벨을 윗줄에 세우면 한마디를 쓴 사람만
          한 행을 더 쓰는데, 답이 문장이냐 칩이냐는 읽는 사람에게 다른 종류의 정보가
          아니다 — 같은 질문에 대한 답이니 같은 자리에서 시작해야 카드끼리도 줄이 맞는다.
          문장은 라벨 옆에서 시작해 남는 폭을 채우고 **최대 두 줄**에서 자른다(넘치면 …):
          `join_purp_txt`는 500자까지 허용되는 자유 입력이라 한 줄로는 첫 어절만 남는
          경우가 있고, 목록 카드에서 세 줄을 주면 카드끼리 높이가 크게 벌어진다. */}
      {!blank && (
        /* 칩이 많아 한 줄을 넘기면 다음 줄로 흐른다. 이때 라벨은 첫 줄 위쪽에
           머물러야 하므로(가운데로 내려앉지 않게) items-baseline. */
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1.5">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            가입목적
          </span>
          {purposeTxt ? (
            // min-w-0 + flex-1 — 라벨 옆 남는 폭을 전부 쓰고 그 안에서 두 줄로 접힌다.
            // (flex 자식은 min-w-0이 없으면 긴 글에서 줄바꿈 대신 칸을 밀어낸다.)
            <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
              “{purposeTxt}”
            </span>
          ) : purposes.length > 0 ? (
            purposes.map((label) => <PurposeChip key={label} label={label} />)
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground/70">
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
