"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { getPbClassAdminBoard } from "@/app/actions/admin/manage-pb-class";
import type { PbClassBoard } from "@/lib/queries/pb-class";

/** 관리자 변경 액션의 공통 반환 모양 — `{ ok, message }` (+ 액션별 페이로드) */
export type PbActionResult = { ok: boolean; message?: string | null };

/**
 * PB 클래스 관리자 보드 로더 — 정보·회차·참여자 탭이 **같은 한 번의 조회**를 쓴다.
 *
 * 보드는 설정·연결된 벙·참가자·합계를 서버가 한 번에 내려 준다(환급 계산을 클라이언트가 다시 하지
 * 않는다 — 회원 화면과 같은 `summarizeRefund` 결과를 본다). 그래서 어떤 변경이든 끝나면
 * `reload()` 한 번으로 모든 숫자가 맞춰진다. 부분 낙관 갱신은 하지 않는다 — 승인 한 번이 합계
 * 네 곳을 바꾸는 구조라 로컬에서 맞추면 반드시 어긋난다.
 */
export function usePbBoard(evtId: string) {
  const [board, setBoard] = useState<PbClassBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 진행 중인 변경의 식별자 — 같은 행의 버튼들을 함께 잠그는 데 쓴다 */
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // 프로젝트를 바꿔 evtId만 달라진 채 이어지면 늦게 도착한 이전 응답이 새 보드를 덮을 수 있다
  const latestEvtId = useRef(evtId);

  const apply = useCallback(
    (forEvtId: string, res: Awaited<ReturnType<typeof getPbClassAdminBoard>>) => {
      if (latestEvtId.current !== forEvtId) return;
      if (res.ok) {
        setBoard(res.board);
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
    void getPbClassAdminBoard(evtId).then((res) => apply(evtId, res));
  }, [evtId, apply]);

  const reload = useCallback(async () => {
    apply(evtId, await getPbClassAdminBoard(evtId));
  }, [evtId, apply]);

  /**
   * 변경 액션 실행 → 토스트 → 성공이면 보드 재조회. 성공 여부를 돌려준다(다이얼로그 닫기 판단용).
   * 실패 문구는 서버가 사람이 읽을 말로 준다(`message`) — 없으면 일반 문구로 떨어진다.
   */
  const run = useCallback(
    async (key: string, action: () => Promise<PbActionResult>, okMessage: string): Promise<boolean> => {
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

  return { board, loading, error, reload, run, busyKey };
}
