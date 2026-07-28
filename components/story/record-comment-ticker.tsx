"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/common/avatar";

import type { PostComment } from "@/lib/hooks/use-post-comments";

/** 한 줄이 머무는 시간(ms) */
const SLIDE_MS = 2000;
/**
 * 한 바퀴를 다 돌고 쉬는 시간(ms). 쉬지 않고 계속 돌면 사진 위에서 말풍선이 끝없이
 * 깜빡여 정작 사진을 못 본다 — 한 바퀴 보여주고 물러났다가 다시 시작한다.
 * 넘기는 2초보다 넉넉히(6초) 쉬는 게 핵심이다: 이 지면의 주인공은 댓글이 아니라 사진이라
 * "말풍선이 없는 시간"이 충분히 길어야 사진을 볼 수 있다.
 */
const REST_MS = 6000;

/**
 * 운동기록 댓글 티커 — 인스타 스토리의 답장 말풍선.
 *
 * **말풍선이지 바가 아니다.** 작은 프사 + 밝은 라운드 풍선이 사진 위에 그냥 떠 있다.
 * 테두리·어두운 판·backdrop-blur를 두르면 UI 컨트롤로 읽히는데, 이건 컨트롤이 아니라
 * "누가 이 사진에 말을 걸었다"는 흔적이라 말풍선이어야 한다.
 *
 * **자리는 작성자 이름 바로 위**다(맨 아래가 아니다). 맨 아래는 입력칸 자리고, 말풍선은
 * 사진에 달린 반응이라 기록 정보(이름·거리·날짜) 위에 얹힌다.
 *
 * **한 바퀴 돌고 쉰다**: 2초씩 넘기다 마지막 댓글까지 가면 6초 쉬고 처음부터 다시.
 * 쉬는 동안 말풍선은 사라진다 — 사진을 온전히 볼 틈을 준다.
 *
 * 데이터는 `usePostComments`가 카드 한 곳에서 읽어 내려준다(하단 입력줄의 개수와 같은
 * 출처 — 따로 읽으면 "말풍선엔 떴는데 숫자는 그대로"가 된다).
 */
export function RecordCommentTicker({
  comments,
  onOpen,
  active,
}: {
  /** null = 아직 조회 전 */
  comments: PostComment[] | null;
  onOpen: () => void;
  /** 보이는 장에서만 타이머를 돌린다 */
  active: boolean;
}) {
  /** 지금 몇 번째 댓글 — null이면 쉬는 중(말풍선 없음) */
  const [idx, setIdx] = useState<number | null>(0);

  const count = comments?.length ?? 0;

  /**
   * 순환 — 2초마다 다음 댓글, 마지막을 지나면 **6초 쉬었다가**(idx=null → 말풍선 사라짐)
   * 처음부터 다시. 한 스텝마다 setTimeout을 새로 잡는 건 대기 시간이 두 종류(2초/6초)라
   * 고정 간격 setInterval로는 표현할 수 없기 때문.
   *
   * 댓글이 1개뿐이어도 돈다 — 계속 떠 있으면 사진을 가리므로 2초 보이고 6초 쉬는 리듬을
   * 그대로 가져간다.
   */
  useEffect(() => {
    if (!active || count === 0) return;
    const id = setTimeout(
      () => {
        setIdx((cur) => {
          // 쉬는 중이었으면 처음부터 다시 시작
          if (cur === null) return 0;
          // 마지막이었으면 쉬러 간다
          if (cur >= count - 1) return null;
          return cur + 1;
        });
      },
      idx === null ? REST_MS : SLIDE_MS,
    );
    return () => clearTimeout(id);
  }, [active, count, idx]);

  // 목록이 줄어(삭제) 현재 인덱스가 범위 밖이면 되돌린다. 렌더 중 조정(effect 아님) —
  // 한 프레임이라도 빈 말풍선을 그리지 않게.
  if (idx !== null && count > 0 && idx >= count) setIdx(0);

  // 댓글 0개 → 아무것도 안 그린다(유도는 하단 입력칸이 맡는다).
  // 쉬는 중(idx=null) → 말풍선만 사라지고 자리는 유지된다(아래 래퍼의 min-h).
  const current = idx !== null && count > 0 ? comments![idx % count] : null;

  return (
    // 자리는 항상 잡아 둔다 — 말풍선이 나타났다 사라질 때마다 아래 이름·거리 줄이
    // 위아래로 튀면 사진 위 정보가 흔들려 보인다. 높이를 미리 재워 두고 안에서만 바뀐다.
    <div className="flex min-h-9 items-end">
      {current && (
        <button
          // key에 cmnt_id를 걸어 줄이 바뀔 때마다 React가 새 노드로 갈아 끼우고,
          // 그 마운트에 붙은 `.ticker-rise`가 아래에서 위로 밀어 올린다.
          key={current.cmnt_id}
          type="button"
          onClick={onOpen}
          aria-label={`댓글 ${count}개 모두 보기`}
          className="ticker-rise pointer-events-auto flex max-w-full items-end gap-2 text-left"
        >
          {/* 작은 프사 — 말풍선 왼쪽 아래에 붙는다(스토리 답장과 같은 배치) */}
          <Avatar
            src={current.avatar_url}
            seed={current.mem_id}
            alt={current.mem_nm}
            size="sm"
            className="size-6 shrink-0 ring-1 ring-white/30"
          />

          {/* 말풍선 — 밝은 판에 어두운 글씨. 사진 위에 얹히므로 살짝 그림자를 줘 띄운다.
              왼쪽 아래 모서리만 각지게(rounded-bl-sm) 해서 프사 쪽을 가리키는 꼬리를 대신한다 —
              삼각형 꼬리를 따로 그리면 사진 색에 따라 경계가 지저분해진다. */}
          <span className="min-w-0 rounded-2xl rounded-bl-sm bg-white/95 px-3 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
            <span className="line-clamp-2 text-[13px] leading-[1.35] text-neutral-900 [overflow-wrap:anywhere]">
              {current.cont_txt}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
