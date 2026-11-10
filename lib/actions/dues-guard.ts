import "server-only";

import { withAdmin, withMember, type ActionContext } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";

/**
 * 회비 액션의 관문 — 접속한 팀이 회비 기능을 끈 팀(`feature.dues = false`, 울산)이면 아무것도 하지 않는다.
 *
 * 화면은 회비 메뉴를 숨기지만 서버 액션은 화면과 별개로 열려 있다(로그인했으면 직접 부를 수 있다).
 * 그래서 숨김만으로는 부족하다 — 울산 회원이 회비 문의를 부르면 운영진에게 「회비 문의」 알림이 갔다.
 * `app/actions/dues/*` 는 전부 이 래퍼를 쓴다(새 회비 액션도). 조회에 실패하면 끈 것으로 본다(§registry onReadError).
 */

const DUES_OFF_MESSAGE = "이 팀은 회비 기능을 쓰지 않아요.";

type Result = { ok: false; message: string } | { ok: true; [key: string]: unknown };

async function duesEnabled(): Promise<boolean> {
  const { teamId } = await getRequestTeamContext();
  return getTeamCfg(teamId, "feature.dues");
}

/** `withAdmin` + 회비 기능 켜진 팀만 */
export async function withDuesAdmin<T extends Result>(
  fn: (ctx: ActionContext) => Promise<T>,
): Promise<T | { ok: false; message: string }> {
  return withAdmin(async (ctx) => {
    if (!(await duesEnabled())) return { ok: false as const, message: DUES_OFF_MESSAGE };
    return fn(ctx);
  });
}

/** `withMember` + 회비 기능 켜진 팀만 — 회원이 부르는 회비 액션(회비 문의)용 */
export async function withDuesMember<T extends Result>(
  fn: (ctx: ActionContext) => Promise<T>,
): Promise<T | { ok: false; message: string }> {
  return withMember(async (ctx) => {
    if (!(await duesEnabled())) return { ok: false as const, message: DUES_OFF_MESSAGE };
    return fn(ctx);
  });
}
