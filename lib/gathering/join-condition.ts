/**
 * 모임 참여조건 판정 — 정본 한 곳.
 *
 * 설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §4
 *
 * 반환이 `boolean`이 아니라 **조건 목록**인 이유:
 * 화면이 "최근 6개월 모임 참석 6회 이상 · 현재 4회"를 보여줘야 해서 boolean 으론 어차피
 * 부족하고, 조건이 늘어도 호출부와 UI 를 안 고치게 된다 — 배열에 항목이 하나 더 들어올 뿐이다.
 *
 * **목록은 "이 중 하나"다(OR).** 참석 횟수 조건에 면제 프로젝트(`exm_evt_id`)를 걸면
 * "6회 이상 **또는** 동계훈련 참가자"가 된다(2026 송년회). AND 로 묶일 조건(회원등급제 등)이
 * 생기면 그때 묶음을 나눈다 — 지금 배열을 AND 로 읽는 곳은 없다.
 *
 * SQL 에 같은 판정을 한 벌 더 만들지 않는다. 상태 전이 RPC 들은 앱 서버가 이 게이트를
 * 통과시킨 뒤에만 호출한다(RPC 는 service_role 전용이라 앱 서버 말고는 못 부른다).
 */

import { dayjs, nowKST } from "@/lib/dayjs";
import type { createUntypedAdminClient } from "@/lib/supabase/admin";

/** 조건 종류 — `attd_cnt` 참석 횟수 · `evt_prt` 면제 프로젝트 승인 참가자 */
export type JoinConditionCode = "attd_cnt" | "evt_prt";

export type JoinCondition = {
  cd: JoinConditionCode;
  /** 화면에 그대로 찍는 문구 — "최근 6개월 모임 참석 6회 이상" */
  label: string;
  met: boolean;
  /** 현재 상태 — "현재 4회". 보여줄 게 없으면 null */
  current: string | null;
};

export type JoinConditionResult = {
  ok: boolean;
  conditions: JoinCondition[];
};

/** gthr_mst 에서 조건에 관계된 부분만 좁힌 표면 */
export type JoinConditionSpec = {
  req_attd_cnt: number | null;
  req_attd_months: number | null;
  /**
   * 참석 조건 면제 프로젝트 — 이 프로젝트의 **승인된 참가자**는 횟수와 무관하게 통과한다.
   * 참석 횟수 조건에 딸린 값이라 횟수가 없으면 의미가 없다(DB CHECK `ck_gthr_mst_exm_evt`).
   *
   * 선택 필드로 둔 건 `hasJoinCondition` 의 undefined 함정과 같은 이유다: 이 컬럼을 안 실은
   * select 가 있으면 undefined 가 오는데, 그때는 **면제 없음**(= 원래의 6회 조건)으로 떨어진다.
   * 문이 닫히는 쪽이라 안전하지만 면제 대상자가 조용히 막히므로, 조건을 판정하는 select 는
   * 전부 이 컬럼을 싣는다.
   */
  exm_evt_id?: string | null;
};

/**
 * 면제 프로젝트에 대한 신청자 상태 — 집계 결과로 주입된다.
 * 현재 지원하는 프로젝트 종류는 PB 클래스(`evt_pb_prt_rel.aprv_yn`)뿐이다.
 */
export type ExemptionStatus = {
  evtNm: string;
  /** 참가 신청은 했는가(입금 확인 전 포함) */
  joined: boolean;
  /** 운영진이 입금을 확인해 승인했는가 */
  approved: boolean;
};

/** 면제 프로젝트로 고를 수 있는 종류 — 승인 개념(`aprv_yn`)이 있는 건 PB 클래스뿐이다. */
export const EXEMPTION_EVT_TYPE = "PB_CLASS";

type SupabaseLike = ReturnType<typeof createUntypedAdminClient>;

/**
 * 조건이 걸려 있는 모임인가 — **횟수만 있으면 조건이다.**
 *
 * `req_attd_months` 는 선택이다. 비어 있으면 "전체 기간" 이라는 뜻이고(가입 이후 누적),
 * 채우면 최근 N개월로 좁힌다. 그래서 기간이 없다고 조건이 없는 건 아니다.
 *
 * ⚠️ `!= null` (느슨한 비교)이어야 한다. DB 는 null 을 주지만, 새 컬럼을 안 실은 select 나
 * 부분 객체는 **undefined** 를 준다 — `!== null` 로 쓰면 그게 "조건 있음"으로 통과해
 * `undefined회 이상`이 만들어지고 **조건 없는 모임의 참석이 통째로 막힌다.**
 * 실제로 이 함수를 배선한 직후 그 상태였다.
 */
export function hasJoinCondition(spec: JoinConditionSpec): boolean {
  return spec.req_attd_cnt != null;
}

/** 조건 없는 모임의 결과 — 조회조차 하지 않고 이걸 돌려준다. */
export const NO_JOIN_CONDITION: JoinConditionResult = { ok: true, conditions: [] };

/**
 * 조건 미달을 사용자에게 한 줄로 알린다 — throw 패턴 액션(참석 토글)이 쓴다.
 *
 * 못 채운 조건만 싣고 현재 상태를 괄호로 붙인다. "조건에 맞지 않아요"만 말하면 사용자는
 * 무엇이 얼마나 모자란지 몰라 문의로 온다.
 */
export function joinConditionErrorMessage(result: JoinConditionResult): string {
  const unmet = result.conditions.filter((c) => !c.met);
  if (unmet.length === 0) return "참여 조건을 충족하지 않아요.";
  // 조건은 "이 중 하나"라 줄을 나누지 않고 "또는"으로 한 문장에 잇는다 — 줄마다
  // "~이어야 참여할 수 있어요"를 붙이면 둘 다 채워야 하는 것처럼 읽힌다.
  const labels = unmet.map((c) => c.label).join(" 또는 ");
  const currents = unmet.map((c) => c.current).filter((v): v is string => !!v);
  return `${labels}${copula(labels)} 참여할 수 있어요.${currents.length ? ` (${currents.join(" · ")})` : ""}`;
}

/** "~이어야/~여야" — 앞 글자에 받침이 있으면 이어야("6회 이상이어야"), 없으면 여야("참가자여야"). */
function copula(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return hasBatchim ? "이어야" : "여야";
}

/**
 * 집계 구간의 시작 경계(UTC ISO).
 *
 * "최근 N개월"은 **날짜** 개념이라 KST 로 고정한다(AGENTS.md 날짜 규칙). 배포처가 UTC 라
 * 그냥 계산하면 KST 00~09시에 하루가 밀려, 같은 사람이 아침에 되고 새벽에 안 되는 일이 생긴다.
 *
 * @param months 구간 길이(개월)
 * @param now 기준 시각(테스트 주입용). 생략 시 지금.
 */
export function attdWindowStartISO(months: number, now: dayjs.Dayjs = nowKST()): string {
  return now.subtract(months, "month").startOf("day").toISOString();
}

/**
 * 조건 문구만 조립한다 — 집계 없이 설정값만으로 만들 수 있다.
 *
 * 클라이언트(일정탭 다이얼로그)는 "현재 몇 회인지"를 계산할 수 없지만 **무슨 조건이 걸렸는지는
 * 보여줘야** 한다. 그 자리와 서버 판정이 같은 문구를 쓰도록 여기 한 곳에서 만든다.
 */
export function joinConditionLabel(months: number | null | undefined, cnt: number): string {
  // 기간이 없으면 "전체 기간" 이라고 굳이 적지 않는다 — 기간 얘기를 빼면 저절로 그 뜻이 된다.
  return months != null ? `최근 ${months}개월 모임 참석 ${cnt}회 이상` : `모임 참석 ${cnt}회 이상`;
}

/** 면제 프로젝트 조건 문구 — "동계훈련 10K PB클래스 3기 참가자" */
export function exemptionLabel(evtNm: string): string {
  return `${evtNm} 참가자`;
}

/**
 * 순수 판정 — 집계 결과를 주입받아 화면 문구까지 만든다. I/O 없음.
 *
 * @param spec 모임의 조건 설정
 * @param counts 집계 결과. 조건이 없으면 쓰이지 않는다. `exemption` 은 면제 프로젝트가
 *   걸려 있고 그 프로젝트를 찾았을 때만 온다 — 없으면 참석 횟수 조건 하나로 판정한다.
 */
export function buildJoinConditions(
  spec: JoinConditionSpec,
  counts: { attdCnt: number; exemption?: ExemptionStatus | null },
): JoinConditionResult {
  if (!hasJoinCondition(spec)) return NO_JOIN_CONDITION;

  const need = spec.req_attd_cnt!;
  const months = spec.req_attd_months ?? null;

  const conditions: JoinCondition[] = [
    {
      cd: "attd_cnt",
      label: joinConditionLabel(months, need),
      met: counts.attdCnt >= need,
      current: `현재 ${counts.attdCnt}회`,
    },
  ];

  const ex = counts.exemption;
  if (ex) {
    conditions.push({
      cd: "evt_prt",
      label: exemptionLabel(ex.evtNm),
      met: ex.approved,
      // 신청만 하고 승인 전인 사람에게만 상태를 말한다 — 그 사람은 "나도 참가자인데 왜
      // 잠겼지"로 문의하게 된다. 신청조차 안 했으면 덧붙일 말이 없다.
      current: !ex.approved && ex.joined ? "입금 확인 전" : null,
    });
  }

  return { ok: conditions.some((c) => c.met), conditions };
}

/**
 * 조건 판정 (조회 포함).
 *
 * 기준 시각은 **신청 시점**이다. 승인 시점에 다시 보지 않는다 — 롤링 구간이라 시간이 지나면
 * 옛 참석이 구간 밖으로 빠져 조건이 조용히 떨어질 수 있는데, 신청 때 통과한 사람을 나중에
 * 떨구는 건 부당하다. 사용자가 화면에서 본 숫자와 판정이 일치해야 한다는 이유도 같다.
 *
 * @param admin 조회용 service role 클라이언트(집계는 팀 전체 모임을 봐야 해서 RLS 로는 부족)
 */
export async function evaluateJoinConditions(
  admin: SupabaseLike,
  {
    spec,
    memId,
    teamId,
    now = nowKST(),
  }: {
    spec: JoinConditionSpec;
    memId: string;
    teamId: string;
    now?: dayjs.Dayjs;
  },
): Promise<JoinConditionResult> {
  if (!hasJoinCondition(spec)) return NO_JOIN_CONDITION;

  const [attdCnt, exemption] = await Promise.all([
    countRecentAttendance(admin, {
      memId,
      teamId,
      months: spec.req_attd_months ?? null,
      now,
    }),
    spec.exm_evt_id != null
      ? loadExemptionStatus(admin, { evtId: spec.exm_evt_id, memId, teamId })
      : Promise.resolve(null),
  ]);

  return buildJoinConditions(spec, { attdCnt, exemption });
}

/**
 * 면제 프로젝트 조회 + 신청자의 참가 상태.
 *
 * 프로젝트가 **다른 팀이거나 PB 클래스가 아니면 null**(면제 줄 자체를 안 그린다) — 저장
 * 시점에 막지만 여기서도 팀을 다시 본다(gthr_mst 행만 고쳐도 남의 팀 프로젝트를 가리킬 수 있다).
 * 조회 실패도 null 로 떨어뜨린다: 면제가 사라질 뿐 원래 조건은 그대로 서므로 문이 열리지 않는다.
 */
async function loadExemptionStatus(
  admin: SupabaseLike,
  { evtId, memId, teamId }: { evtId: string; memId: string; teamId: string },
): Promise<ExemptionStatus | null> {
  const [{ data: evt, error: evtError }, { data: prt, error: prtError }] = await Promise.all([
    admin
      .from("evt_team_mst")
      .select("evt_nm, team_id, evt_type_cd")
      .eq("evt_id", evtId)
      .maybeSingle(),
    admin
      .from("evt_pb_prt_rel")
      .select("aprv_yn")
      .eq("evt_id", evtId)
      .eq("mem_id", memId)
      .maybeSingle(),
  ]);

  if (evtError || prtError) {
    console.error("[join-condition] 면제 프로젝트 조회 실패", (evtError ?? prtError)?.message);
    return null;
  }
  const e = evt as { evt_nm: string; team_id: string; evt_type_cd: string } | null;
  if (!e || e.team_id !== teamId || e.evt_type_cd !== EXEMPTION_EVT_TYPE) return null;

  const p = prt as { aprv_yn: boolean } | null;
  return { evtNm: e.evt_nm, joined: !!p, approved: p?.aprv_yn === true };
}

/**
 * 최근 N개월 모임 참석 횟수.
 *
 * ⚠️ `stt_at <= now` 필터가 핵심이다. gthr_attd_rel 은 **아직 열리지 않은 모임에 대한
 * 신청분도** 담고 있어서(참석 토글은 미래 모임에 거는 것이다), 안 걸면 "다음 달 벙 5개에
 * 참석 누르기"만으로 조건이 채워진다. toggle-attendance 의 칭호 주석이 지적한 것과 같은 함정.
 */
async function countRecentAttendance(
  admin: SupabaseLike,
  { memId, teamId, months, now }: { memId: string; teamId: string; months: number | null; now: dayjs.Dayjs },
): Promise<number> {
  let q = admin
    .from("gthr_attd_rel")
    .select("attd_id, gthr_mst!inner(gthr_id)", { count: "exact", head: true })
    .eq("mem_id", memId)
    .eq("gthr_mst.team_id", teamId)
    .eq("gthr_mst.del_yn", false)
    .lte("gthr_mst.stt_at", now.toISOString());

  // 기간이 없으면 하한을 안 건다 = 전체 기간 누적.
  if (months != null) q = q.gte("gthr_mst.stt_at", attdWindowStartISO(months, now));

  const { count, error } = await q;

  if (error) {
    // 집계 실패를 "조건 충족"으로 떨어뜨리면 게이트가 열린다. 0으로 보아 막고 로그를 남긴다.
    console.error("[join-condition] 참석 횟수 집계 실패", error.message);
    return 0;
  }

  return count ?? 0;
}
