/**
 * 깅스타그램 · 댓글 · 응원 · 대회 계열 조건 평가 — 신규 25종 중 나머지 12종.
 *
 * 설계: docs/design/2026-07-30-신규-칭호-후보-모임-깅스타그램.md §7.1
 *
 * 모임 계열(`evaluators-gathering.ts`)과 같은 규칙을 따른다:
 * **기준은 그 활동이 실제로 일어난 날**이고, `crt_at`은 **실행일이 따로 없을 때만** 쓴다(§7.5).
 *   · 깅스타그램 → `post_mst.act_dt`(활동일). 사용자가 직접 적지만, 과거로 적으면 적용일
 *     이전이 되어 **오히려 안 세어지므로** 우회가 성립하지 않는다.
 *   · 대회       → `rec_race_hist.race_dt`
 *   · 댓글·응원  → `crt_at` (댓글을 쓰는 행위 자체가 그때 일어난다)
 */

import { dayjs } from "@/lib/dayjs";

import type {
  CondCmntMentionCount,
  CondCmntMonthlyTop,
  CondCmntReplyCount,
  CondPostBackfillDays,
  CondPostCount,
  CondPostDaysInMonth,
  CondPostSelfFirstComment,
  CondRacePairReversal,
  CondRaceTimeExactHour,
  CondRctnRecvTotal,
} from "./types";

const KST = "Asia/Seoul";

type DB = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** 이 조건이 볼 수 있는 활동의 창. 모임 계열의 `GatheringWindow`와 같은 역할. */
export type SocialWindow = {
  /** 칭호 적용 시작일(YYYY-MM-DD, KST). null이면 소급 제한 없음. */
  effStartDt: string | null;
  /** 같은 멤버의 조건들이 조회를 나눠 쓰는 캐시. */
  cache?: Map<string, unknown>;
};

async function cached<T>(win: SocialWindow, key: string, load: () => Promise<T>): Promise<T> {
  const k = `${key}|${win.effStartDt ?? ""}`;
  const hit = win.cache?.get(k);
  if (hit !== undefined) return hit as T;
  const value = await load();
  win.cache?.set(k, value);
  return value;
}

/** date 문자열(YYYY-MM-DD)이 적용일 이후인가. */
function afterEff(dt: string | null, win: SocialWindow): boolean {
  if (!dt) return false;
  return !win.effStartDt || dt >= win.effStartDt;
}

/** timestamptz를 KST 날짜로 환산해 적용일과 비교한다. */
function afterEffTs(ts: string | null, win: SocialWindow): boolean {
  if (!ts) return false;
  return afterEff(dayjs(ts).tz(KST).format("YYYY-MM-DD"), win);
}

// ---------------------------------------------------------------------------
// 깅스타그램 (#11 #12 #13)
// ---------------------------------------------------------------------------

type PostRow = { postId: string; actDt: string | null; crtAt: string };

/**
 * 이 멤버의 **사진이 있는** 깅스타그램 글.
 *
 * 사진이 이 지면에 서는 유일한 조건이라(`get_team_posts` RPC가 `photo_url IS NOT NULL`로
 * 거른다), 칭호도 같은 기준을 쓴다 — 화면에 안 뜨는 글로 칭호가 붙으면 안 된다.
 * 출처(`src_enm`)는 가리지 않는다: 마일리지런에서 유입된 것도 본인이 올린 사진이다.
 */
function loadPhotoPosts(db: DB, memId: string, win: SocialWindow): Promise<PostRow[]> {
  return cached(win, `posts:${memId}`, async () => {
    const { data } = await db
      .from("post_mst")
      .select("post_id, act_dt, crt_at")
      .eq("mem_id", memId)
      .eq("del_yn", false)
      .not("photo_url", "is", null);

    return ((data ?? []) as { post_id: string; act_dt: string | null; crt_at: string }[])
      .map((r) => ({ postId: r.post_id, actDt: r.act_dt, crtAt: r.crt_at }))
      // 활동일이 적용일 이후인 것만. act_dt가 없으면 등록 시각으로 갈음한다.
      .filter((p) => (p.actDt ? afterEff(p.actDt, win) : afterEffTs(p.crtAt, win)));
  });
}

/** #11 사진 글 누적 N장 (오운완 3장 · 깅플루언서 10장) */
export async function evalPostCount(
  rule: CondPostCount,
  memId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  const posts = await loadPhotoPosts(db, memId, win);
  return posts.length >= rule.count;
}

/**
 * #12 같은 KST 월에 사진 글을 올린 **서로 다른 `act_dt`** 수 (연재작가 월 5일)
 *
 * ⚠️ `act_dt`는 사용자가 직접 적는 값이라, 하루에 다섯 장을 날짜만 바꿔 올리면 성립한다.
 * 과거 날짜 입력은 `유물발굴`의 전제라 막을 수도 없어 **감수한다** — 겨루는 자리가 아니라
 * 친목·응원 지면이라 방어를 세울 값이 아니다(§4.1).
 */
export async function evalPostDaysInMonth(
  rule: CondPostDaysInMonth,
  memId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  const posts = await loadPhotoPosts(db, memId, win);
  const daysByMonth = new Map<string, Set<string>>();
  for (const p of posts) {
    const d = p.actDt ?? dayjs(p.crtAt).tz(KST).format("YYYY-MM-DD");
    const ym = d.slice(0, 7);
    if (!daysByMonth.has(ym)) daysByMonth.set(ym, new Set());
    daysByMonth.get(ym)!.add(d);
  }
  return [...daysByMonth.values()].some((s) => s.size >= rule.days);
}

/**
 * #13 활동일보다 N일 이상 늦게 올린 글 (유물발굴 14일)
 *
 * **날짜끼리 빼는 것이지 경과 시각(14×24h)이 아니다**(§8). 등록 시각은 KST 날짜로 환산한다.
 */
export async function evalPostBackfillDays(
  rule: CondPostBackfillDays,
  memId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  const posts = await loadPhotoPosts(db, memId, win);
  const hits = posts.filter((p) => {
    if (!p.actDt) return false;
    const uploaded = dayjs.tz(dayjs(p.crtAt).tz(KST).format("YYYY-MM-DD"), KST);
    const acted = dayjs.tz(p.actDt, KST);
    return uploaded.diff(acted, "day") >= rule.days;
  });
  return hits.length >= rule.count;
}

// ---------------------------------------------------------------------------
// 댓글 (#14 #15 #16 #17)
// ---------------------------------------------------------------------------

type CommentRow = { cmntId: string; entityType: string; entityId: string; prntId: string | null; crtAt: string };

/** 이 멤버가 쓴 댓글(삭제 제외). 적용일은 작성 시각(KST) 기준 — 댓글은 실행일이 곧 적재일이다. */
function loadMyComments(db: DB, memId: string, win: SocialWindow): Promise<CommentRow[]> {
  return cached(win, `comments:${memId}`, async () => {
    const { data } = await db
      .from("cmnt_mst")
      .select("cmnt_id, entity_type, entity_id, prnt_id, crt_at")
      .eq("mem_id", memId)
      .eq("del_yn", false);

    return ((data ?? []) as {
      cmnt_id: string; entity_type: string; entity_id: string; prnt_id: string | null; crt_at: string;
    }[])
      .map((r) => ({
        cmntId: r.cmnt_id, entityType: r.entity_type, entityId: r.entity_id,
        prntId: r.prnt_id, crtAt: r.crt_at,
      }))
      .filter((c) => afterEffTs(c.crtAt, win));
  });
}

/** #15 대댓글 N개 (말대꾸) — **삭제 제외**(`투머치토커`와 같은 기준) */
export async function evalCmntReplyCount(
  rule: CondCmntReplyCount,
  memId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  const comments = await loadMyComments(db, memId, win);
  return comments.filter((c) => c.prntId !== null).length >= rule.count;
}

/**
 * #16 @멘션 N회 (소환술사)
 *
 * **자기 자신 멘션은 제외**하고, **같은 사람을 여러 번 부른 건 포함**한다 —
 * 세는 건 "부르는 행위"지 "몇 명을 불렀나"가 아니다(§4.1).
 * 멘션은 별도 테이블(`cmnt_mention_rel`)에 있어 본문 파싱이 필요 없다.
 */
export async function evalCmntMentionCount(
  rule: CondCmntMentionCount,
  memId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  const comments = await loadMyComments(db, memId, win);
  if (!comments.length) return false;

  const { data } = await db
    .from("cmnt_mention_rel")
    .select("cmnt_id, mem_id")
    .in("cmnt_id", comments.map((c) => c.cmntId));

  // 내가 쓴 댓글에 달린 멘션 중, 대상이 나 자신이 아닌 것.
  const hits = ((data ?? []) as { cmnt_id: string; mem_id: string }[]).filter(
    (m) => m.mem_id !== memId,
  );
  return hits.length >= rule.count;
}

/**
 * #14 자기 게시물의 **최초 댓글**을 본인이 작성 (자문자답)
 *
 * "최초"는 그 게시물의 전체 댓글 중 가장 이른 것이다 — 내 댓글만 보면 남이 먼저 단 경우를
 * 놓친다. 삭제된 댓글은 세지 않는다(다른 댓글 조건과 같은 기준).
 */
export async function evalPostSelfFirstComment(
  rule: CondPostSelfFirstComment,
  memId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  const posts = await loadPhotoPosts(db, memId, win);
  if (!posts.length) return false;

  const { data } = await db
    .from("cmnt_mst")
    .select("entity_id, mem_id, crt_at")
    .eq("entity_type", "post")
    .eq("del_yn", false)
    .in("entity_id", posts.map((p) => p.postId))
    .order("crt_at", { ascending: true });

  const firstByPost = new Map<string, string>();
  for (const r of (data ?? []) as { entity_id: string; mem_id: string }[]) {
    if (!firstByPost.has(r.entity_id)) firstByPost.set(r.entity_id, r.mem_id);
  }

  let hits = 0;
  for (const [, firstMemId] of firstByPost) if (firstMemId === memId) hits += 1;
  return hits >= rule.count;
}

/**
 * #17 한 KST 달력월의 댓글 수 **1위** (투머치토커)
 *
 * 규칙이 셋이다(§4.3):
 *   · **최소 문턱**을 넘어야 한다 — 조용한 달엔 댓글 2개 쓰고 Too Much Talker가 된다.
 *   · **동률 1위면 아무에게도 안 준다** — 차순위로 안 내려가는 것과 같은 태도.
 *   · 1위가 이미 보유자면 그 달은 수여 없음 → 엔진이 보유자를 스킵하므로 자동으로 성립한다.
 *
 * ⚠️ **월이 끝나야 1위가 확정된다.** 진행 중인 달에 돌리면 잠정 1위가 받아 버리고,
 * 비회수라 되돌릴 수 없다 — 그래서 월 마감 배치 전용이다(`TRIGGER_COND_MAP`).
 */
export async function evalCmntMonthlyTop(
  rule: CondCmntMonthlyTop,
  memId: string,
  teamId: string,
  baseMonth: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  // 적용일이 기준 월 이후면 그 달은 애초에 판정 대상이 아니다.
  if (win.effStartDt && baseMonth < win.effStartDt.slice(0, 7)) return false;

  // ⚠️ **팀 공통 집계라 캐시 키에 memId를 넣지 않는다.** 1위가 누구인지는 멤버와 무관하게
  // 한 번 계산하면 되는데, 예전엔 멤버마다 팀 전체 댓글을 다시 읽어 200번 나갔다
  // (월 배치 20초의 주범이었다).
  const counts = await cached(win, `team-comments:${teamId}:${baseMonth}`, async () => {
    const monthStart = dayjs.tz(`${baseMonth}-01`, KST);
    const nextMonth = monthStart.add(1, "month");

    const { data } = await db
      .from("cmnt_mst")
      .select("mem_id, crt_at")
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .gte("crt_at", monthStart.toISOString())
      .lt("crt_at", nextMonth.toISOString());

    const m = new Map<string, number>();
    for (const r of (data ?? []) as { mem_id: string }[]) {
      m.set(r.mem_id, (m.get(r.mem_id) ?? 0) + 1);
    }
    return m;
  });

  if (!counts.size) return false;

  const max = Math.max(...counts.values());
  if (max < rule.min_count) return false; // 조용한 달엔 아무에게도 안 준다

  const leaders = [...counts.entries()].filter(([, n]) => n === max);
  if (leaders.length > 1) return false; // 동률 1위 → 수여 없음

  return leaders[0][0] === memId;
}

// ---------------------------------------------------------------------------
// 응원 (#18)
// ---------------------------------------------------------------------------

/**
 * #18 받은 응원 누적 N (인간화로)
 *
 * ⚠️ **집계 경계는 프로필 카드의 `rctn_recv_cnt`와 같아야 한다**(§4.3) — 두 곳이 어긋나면
 * 카드의 🔥와 칭호 진행도가 따로 논다. `get_public_member_card`와 같은 세 갈래를 더한다:
 *   · `actv`/`newbie` — `entity_id = mem_id`
 *   · `record`       — 본인 대회 기록에 달린 것
 *   · `post`         — 본인 깅스타그램 글에 달린 것
 * **`race`(대회 응원)는 뺀다** — 사람이 받은 게 아니라 대회에 달린 것이라, 같은 대회
 * 출전자 전원이 같은 수치를 나눠 갖게 되어 개인 지표로 성립하지 않는다.
 *
 * ⚠️ **적용일 필터가 불가능하다.** `rctn_mst`는 (팀 × 항목 × 누른사람) 1행에 `rctn_cnt`를
 * 누적하는 구조라 개별 탭의 시각이 없다(`crt_at`은 그 행이 처음 생긴 시각일 뿐). 그래서
 * 이 칭호만 `eff_stt_dt = null`(소급 허용)로 시드한다 — 문턱이 1,000이라 소급해도 받을
 * 사람이 극소수다(§7.5).
 */
export async function evalRctnRecvTotal(
  rule: CondRctnRecvTotal,
  memId: string,
  teamId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  // 응원 원장 전체를 **팀 단위로 한 번** 읽어 entity_id로 색인해 둔다.
  // 예전엔 멤버당 5쿼리(직접·내기록·내글 + 기록응원·글응원)가 나갔다.
  const byEntity = await cached(win, `team-reactions:${teamId}`, async () => {
    const { data } = await db
      .from("rctn_mst")
      .select("entity_type, entity_id, rctn_cnt")
      .eq("team_id", teamId)
      .in("entity_type", ["actv", "newbie", "record", "post"]);

    const m = new Map<string, number>();
    for (const r of (data ?? []) as { entity_type: string; entity_id: string; rctn_cnt: number }[]) {
      const key = `${r.entity_type}|${r.entity_id}`;
      m.set(key, (m.get(key) ?? 0) + (r.rctn_cnt ?? 0));
    }
    return m;
  });

  const sumKeys = (type: string, ids: string[]) =>
    ids.reduce((n, id) => n + (byEntity.get(`${type}|${id}`) ?? 0), 0);

  // ① actv·newbie — entity_id가 곧 mem_id
  let total = sumKeys("actv", [memId]) + sumKeys("newbie", [memId]);

  // ② record — 본인 대회 기록에 달린 것
  const raceIds = await cached(win, `my-race-ids:${memId}`, async () => {
    const { data } = await db.from("rec_race_hist").select("race_result_id")
      .eq("mem_id", memId).eq("vers", 0).eq("del_yn", false);
    return ((data ?? []) as { race_result_id: string }[]).map((r) => r.race_result_id);
  });
  total += sumKeys("record", raceIds);

  // ③ post — 본인 깅스타그램 글에 달린 것
  const posts = await loadPhotoPosts(db, memId, { effStartDt: null, cache: win.cache });
  total += sumKeys("post", posts.map((p) => p.postId));

  return total >= rule.count;
}

// ---------------------------------------------------------------------------
// 대회 (#19 #21)
// ---------------------------------------------------------------------------

type RaceRow = { compEvtId: string | null; evtType: string | null; raceDt: string; sec: number; memId: string };

/**
 * #19 완주 기록이 정확히 시간 단위로 떨어짐 (완벽한기록)
 *
 * ⚠️ **`rec_time_sec > 0` 가드가 필요하다.** `0 % 3600 = 0`이라 기록이 0인 행이 생기면
 * 전원에게 부여된다(§4.1). prd 실측 0건이라 급하진 않지만 한 줄이라 그냥 넣는다.
 */
export async function evalRaceTimeExactHour(
  rule: CondRaceTimeExactHour,
  memId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  const { data } = await db
    .from("rec_race_hist")
    .select("rec_time_sec, race_dt")
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false);

  const hits = ((data ?? []) as { rec_time_sec: number; race_dt: string }[]).filter(
    (r) => r.rec_time_sec > 0 && r.rec_time_sec % 3600 === 0 && afterEff(r.race_dt, win),
  );
  return hits.length >= rule.count;
}

/**
 * #21 같은 종목 맞대결 역전 (하수야~ / 고수님..)
 *
 * 같은 상대와 **같은 종목**으로 서로 다른 대회를 2회 이상 만나고, `race_dt` 순으로
 * **먼저 지고 나중에 이긴** 사건. `direction`이 이긴 쪽/진 쪽을 가른다.
 *
 * **순서가 조건의 전부다** — 그냥 "서로 이겨본 적 있음"으로 짜면 누가 복수한 건지 갈리지
 * 않아 둘 다 같은 칭호를 받는다. **종목도 고정**이다(같은 대회라도 10K와 풀은 맞대결이 아니다).
 *
 * ⚠️ **적용일은 "역전이 일어난 나중 대회" 기준이다.** 두 대회가 모두 적용일 이후여야 한다고
 * 짜면 대회가 드물어 실제 발급까지 1년 이상 걸린다(§7.5).
 */
export async function evalRacePairReversal(
  rule: CondRacePairReversal,
  memId: string,
  teamId: string,
  win: SocialWindow,
  db: DB,
): Promise<boolean> {
  // 내가 뛴 대회·종목 목록
  const { data: mine } = await db
    .from("rec_race_hist")
    .select("comp_evt_id, comp_evt_type, race_dt, rec_time_sec")
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .gt("rec_time_sec", 0);

  const myRaces = ((mine ?? []) as {
    comp_evt_id: string | null; comp_evt_type: string | null; race_dt: string; rec_time_sec: number;
  }[]).map((r) => ({
    compEvtId: r.comp_evt_id, evtType: r.comp_evt_type, raceDt: r.race_dt,
    sec: r.rec_time_sec, memId,
  })) as RaceRow[];
  if (myRaces.length < 2) return false;

  // 같은 대회·종목에 뛴 다른 사람들
  const evtIds = [...new Set(myRaces.map((r) => r.compEvtId).filter(Boolean))] as string[];
  if (!evtIds.length) return false;

  const { data: others } = await db
    .from("rec_race_hist")
    .select("mem_id, comp_evt_id, comp_evt_type, race_dt, rec_time_sec")
    .in("comp_evt_id", evtIds)
    .eq("vers", 0)
    .eq("del_yn", false)
    .gt("rec_time_sec", 0);

  // (상대 × 종목)별로 맞대결을 시간순으로 모은다.
  type Duel = { raceDt: string; iWon: boolean };
  const duels = new Map<string, Duel[]>();

  for (const o of (others ?? []) as {
    mem_id: string; comp_evt_id: string; comp_evt_type: string | null; race_dt: string; rec_time_sec: number;
  }[]) {
    if (o.mem_id === memId) continue;
    const my = myRaces.find(
      (m) => m.compEvtId === o.comp_evt_id && m.evtType === o.comp_evt_type,
    );
    if (!my) continue;
    if (my.sec === o.rec_time_sec) continue; // 동률은 승부가 아니다

    const key = `${o.mem_id}|${o.comp_evt_type ?? ""}`;
    const list = duels.get(key) ?? [];
    list.push({ raceDt: my.raceDt, iWon: my.sec < o.rec_time_sec });
    duels.set(key, list);
  }

  for (const list of duels.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.raceDt.localeCompare(b.raceDt));

    // 인접한 두 대결에서 결과가 뒤집힌 지점을 찾는다.
    for (let i = 1; i < list.length; i++) {
      const before = list[i - 1];
      const after = list[i];
      if (before.iWon === after.iWon) continue;
      // 적용일은 **나중 대회** 기준
      if (!afterEff(after.raceDt, win)) continue;

      // 먼저 지고(before.iWon=false) 나중에 이겼으면(after.iWon=true) 내가 역전한 쪽이다.
      const iReversed = !before.iWon && after.iWon;
      if (rule.direction === "winner" && iReversed) return true;
      if (rule.direction === "loser" && !iReversed) return true;
    }
  }

  return false;
}
