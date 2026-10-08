"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { getPbGameAdmin } from "@/app/actions/admin/manage-pb-class-game";
import type { PbGame } from "@/lib/queries/pb-class-game";

import type { PbActionResult } from "./use-pb-board";

/** `run`의 모양 — 탭 본문·다이얼로그 컴포넌트가 props로 받아 쓴다 */
export type PbRun = (
  key: string,
  action: () => Promise<PbActionResult>,
  okMessage: string,
) => Promise<boolean>;

/**
 * PB 클래스 2·3단계(팀·기록·점수) 관리자 로더 — 세 탭이 같은 `PbGame` 한 덩어리를 쓴다.
 *
 * 점수판은 서버가 원천(벙·기록)에서 매번 계산해 내려 주므로(저장하지 않는다)
 * 어떤 변경이든 끝나면 `reload()` 한 번으로 점수·순위가 맞춰진다. 팀 하나를 옮기면
 * 팀 평균·전원 출석·순위가 줄줄이 바뀌는 구조라 로컬에서 부분 갱신하면 반드시 어긋난다.
 * 패턴은 `use-pb-board.ts`와 같다 — 조회 대상(보드 → 게임)만 다르다.
 */
export function usePbGame(evtId: string) {
  const [game, setGame] = useState<PbGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 진행 중인 변경의 식별자 — 같은 화면의 버튼들을 함께 잠그는 데 쓴다 */
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // 프로젝트를 바꿔 evtId만 달라진 채 이어지면 늦게 도착한 이전 응답이 새 게임을 덮을 수 있다
  const latestEvtId = useRef(evtId);

  const apply = useCallback(
    (forEvtId: string, res: Awaited<ReturnType<typeof getPbGameAdmin>>) => {
      if (latestEvtId.current !== forEvtId) return;
      if (res.ok) {
        setGame(res.game);
        setError(null);
      } else {
        setError(res.message ?? "불러오지 못했어요");
      }
      setLoading(false);
    },
    [],
  );

  // 첫 조회 — 응답 콜백에서만 setState 한다(이펙트 본문에서 동기로 부르지 않는다)
  useEffect(() => {
    latestEvtId.current = evtId;
    void getPbGameAdmin(evtId).then((res) => apply(evtId, res));
  }, [evtId, apply]);

  const reload = useCallback(async () => {
    apply(evtId, await getPbGameAdmin(evtId));
  }, [evtId, apply]);

  /** 변경 액션 실행 → 토스트 → 성공이면 재조회. 성공 여부를 돌려준다(다이얼로그 닫기·로컬 편집 비우기 판단용). */
  const run: PbRun = useCallback(
    async (key, action, okMessage) => {
      setBusyKey(key);
      try {
        const res = await action();
        if (!res.ok) {
          toast.error(res.message ?? "처리하지 못했어요. 다시 시도해 주세요.");
          return false;
        }
        toast.success(res.message ?? okMessage);
        await reload();
        return true;
      } catch {
        toast.error("처리하지 못했어요. 다시 시도해 주세요.");
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [reload],
  );

  return { game, loading, error, reload, run, busyKey };
}
