import { dayjs, todayKST } from "@/lib/dayjs";

/**
 * "이 사람, 언제부터 지금 상태인가" 를 정하는 한 곳.
 *
 * 재가입 요청을 받은 운영진이 가장 먼저 묻는 게 **언제 나갔느냐**인데, 그 답이 한 컬럼에
 * 들어 있지 않다. `team_mem_rel` 은 상태가 바뀔 때마다 **변경 전** 스냅샷을 `vers=max+1`
 * 이력으로 밀고 정본(`vers=0`)을 갱신하므로(`apply_team_mem_rel_change`), 날짜를 맞히려면
 * 타임라인을 거슬러 올라가야 한다. 함정이 셋이다.
 *
 *  ① **정본의 `eff_at` 은 역할 변경에도 갱신된다.** 비활성 중에 관리자 지정만 바꿔도 날짜가
 *    오늘로 당겨진다 — 같은 상태가 이어지는 이력을 끝까지 따라가야 진짜 전환일이 나온다.
 *  ② **삭제 경계를 넘으면 남의 이야기다.** 삭제는 정본을 `del_yn=true` 이력으로 밀어
 *    슬롯을 비우므로(`apply_team_mem_rel_delete`), 그 행보다 과거는 **이전 소속 에피소드**다.
 *    거기까지 거슬러 가면 재가입한 사람의 전환일이 몇 년 전으로 찍힌다.
 *  ③ **탈퇴는 `leave_dt` 가 먼저다.** 2026-07-15 이관 때 한꺼번에 탈퇴로 바뀐 사람들은
 *    `eff_at` 이 전부 이관 시각이라, 그걸 믿으면 다 같은 날 나간 것으로 보인다.
 *
 * 이력 행은 **새 PK** 를 받으므로(`gen_random_uuid()`) 조회는 `team_mem_id` 가 아니라
 * `(team_id, mem_id)` 로 해야 한 사람의 타임라인이 모인다 — 호출부가 자주 틀리는 지점이다.
 *
 * `vers` 는 시간순이다(`max+1` 로 증가) — **오름차순이 과거→현재**이고 정본(0)이 가장 최신이다.
 */

/** 타임라인 한 줄 — `team_mem_rel` 에서 필요한 컬럼만. */
export type MemberStatusRow = {
  vers: number;
  mem_st_cd: string;
  eff_at: string;
  del_yn: boolean;
  leave_dt: string | null;
};

export type MemberStatusSince = {
  /** 지금 상태(`inactive` | `left`) */
  status: string;
  /** 그 상태가 시작된 날(KST, `YYYY-MM-DD`) */
  sinceDt: string;
  /** KST 기준 경과일. 오늘이면 0 */
  daysAgo: number;
};

/**
 * 비활성·탈퇴 회원이 **언제부터** 그 상태인지. 활성이거나 판정할 수 없으면 `null`.
 *
 * 활성에 `null` 을 주는 건 의도다 — 활성 회원에게 "활성 전환일"은 묻는 사람이 없고,
 * 가입일(`join_dt`)이 이미 그 자리를 차지하고 있다.
 *
 * @param rows 한 사람의 `(team_id, mem_id)` 전체 행(정본 + 이력). 순서는 상관없다.
 * @param today 경과일 기준일(KST `YYYY-MM-DD`). 생략하면 오늘.
 */
export function getMemberStatusSince(
  rows: MemberStatusRow[],
  today: string = todayKST(),
): MemberStatusSince | null {
  // 정본 = vers 0 이면서 살아 있는 행. 삭제 회원은 슬롯이 비어 있어 여기서 걸러진다.
  const current = rows.find((r) => r.vers === 0 && !r.del_yn);
  if (!current) return null;
  if (current.mem_st_cd !== "inactive" && current.mem_st_cd !== "left") return null;

  // 탈퇴일이 적혀 있으면 그게 정답이다(③) — 이력을 거슬러 봐야 이관 시각만 나온다.
  if (current.mem_st_cd === "left" && current.leave_dt) {
    return build(current.mem_st_cd, current.leave_dt, today);
  }

  // 과거→현재 순. 정본(vers=0)은 별도로 들고 있으므로 이력만 모은다.
  const history = rows.filter((r) => r.vers > 0).sort((a, b) => a.vers - b.vers);

  let sinceAt = current.eff_at;
  // 최신 이력부터 거슬러 올라가며 **같은 상태가 이어지는 동안** 시작점을 당긴다(①).
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.del_yn) break; // 삭제 경계 — 이 아래는 이전 소속 에피소드다(②)
    if (r.mem_st_cd !== current.mem_st_cd) break;
    sinceAt = r.eff_at;
  }

  return build(current.mem_st_cd, sinceAt, today);
}

/**
 * 시각/날짜를 KST 날짜 + 경과일로 묶는다.
 *
 * `eff_at` 은 timestamptz 라 **반드시 KST 로 돌려 찍는다** — 그냥 `format()` 하면 배포처(UTC)
 * 기준이라 KST 00~09시 전환이 하루 전으로 적힌다. 경과일도 날짜끼리 세야 시각 차이로
 * "0일 전"과 "1일 전"이 오가지 않는다.
 */
function build(status: string, at: string, today: string): MemberStatusSince {
  const sinceDt = dayjs(at).tz("Asia/Seoul").format("YYYY-MM-DD");
  const daysAgo = dayjs(today).diff(dayjs(sinceDt), "day");
  return { status, sinceDt, daysAgo };
}

/** `2026.09.01 (44일 전)` — 화면 한 줄. 오늘이면 `(오늘)`. */
export function formatStatusSince(since: MemberStatusSince): string {
  const dt = since.sinceDt.replace(/-/g, ".");
  return since.daysAgo <= 0 ? `${dt} (오늘)` : `${dt} (${since.daysAgo}일 전)`;
}

/** 상태별 라벨 — 같은 한 줄이 비활성·탈퇴 두 자리에 선다. */
export function statusSinceLabel(status: string): string {
  return status === "left" ? "탈퇴일" : "비활성 전환일";
}
