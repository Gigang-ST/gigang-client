"use server";

import { withAdmin } from "@/lib/actions/auth";
import {
  insertNotiForTeam,
  insertNotiMany,
} from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export type NotiTypeEnm = "adm_cust" | "dues_notice" | "cmnt_reply" | "cmnt_mention";

export async function sendNotification(input: {
  target: "all" | string[];
  notiNm: string;
  notiCont?: string | null;
  notiTypeEnm?: NotiTypeEnm;
}) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const notiTypeEnm = input.notiTypeEnm ?? "adm_cust";
    // 한 번의 관리자 발송 = 하나의 배치. 발송 이력 화면이 이 값으로 수신자를 묶는다.
    const batchId = crypto.randomUUID();

    try {
      if (input.target === "all") {
        await insertNotiForTeam({
          teamId,
          notiTypeEnm,
          notiNm: input.notiNm,
          notiCont: input.notiCont ?? null,
          batchId,
        });
      } else {
        await insertNotiMany({
          teamId,
          memIds: input.target,
          notiTypeEnm,
          notiNm: input.notiNm,
          notiCont: input.notiCont ?? null,
          batchId,
        });
      }
    } catch {
      return { ok: false as const, message: "알림 발송에 실패했습니다." };
    }

    return { ok: true as const, message: null };
  });
}
