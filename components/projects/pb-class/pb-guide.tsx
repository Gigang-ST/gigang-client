import type { ReactNode } from "react";

import { parseEventTime } from "@/lib/dayjs";
import {
  feesForJoinWeek,
  refundAmt,
  remainingSessCnt,
  requiredAttdCnt,
  wkLabel,
  type PbClassCfg,
} from "@/lib/pb-class";
import { PB_TRN_GROUPS } from "@/lib/pb-class-plan";
import { type PbRule } from "@/lib/pb-class-score";
import type { PbEvent, PbParticipant } from "@/lib/queries/pb-class";
import { cn } from "@/lib/utils";

import { Body, Caption, Micro } from "@/components/common/typography";
import {
  PB_MONEY_USE_DETAIL_TXT,
  PB_MONEY_USE_TXT,
  formatLimit,
  formatPeriod,
  formatWon,
} from "./format";
import { trnGroupOf } from "./pb-training";
import { PbZone } from "./pb-zone";

/*
 * 안내 탭 — 「PB 클래스 규칙이 곧 안내사항」(오너). 예전엔 규칙 카드 한 장 + 같은 내용의 시트가 따로 있었고
 * 둘 다 여섯 줄짜리 요약이라, 정작 「몇 번 나오면 얼마 돌려받나」「3주차에 들어가면?」을 물으러 왔다.
 *
 * **숫자는 하나도 박지 않는다** — 전부 cfg(금액·회차)·rule(배점·목표)·훈련팀 표(`PB_TRN_GROUPS`)에서 뽑는다.
 * 관리자가 설정을 바꾸는 순간 안내가 거짓말이 되면, 돈이 걸린 안내라 사고다.
 * 말투는 해요체, 한 문장에 한 사실.
 */

const TOC: { id: string; label: string }[] = [
  { id: "pb-guide-glance", label: "한눈에" },
  { id: "pb-guide-fees", label: "참가비" },
  { id: "pb-guide-refund", label: "환급" },
  { id: "pb-guide-join", label: "중간 합류" },
  { id: "pb-guide-groups", label: "훈련팀" },
  { id: "pb-guide-score", label: "점수" },
  { id: "pb-guide-goal", label: "목표·기록" },
  { id: "pb-guide-daegu", label: "대구" },
  { id: "pb-guide-settle", label: "정산" },
];

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((text, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <Caption className="break-keep leading-relaxed text-foreground">{text}</Caption>
        </li>
      ))}
    </ul>
  );
}

/** 강조 숫자 — 문장 속 숫자를 굵게(읽는 사람이 훑을 때 숫자부터 본다) */
const N = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold tabular-nums text-foreground">{children}</span>
);

/** 표 머리·칸 공통 — 13px, 숫자는 고정폭. 줄 사이는 데이터 행 괘선(rule-row) */
const TH = "py-2 text-left text-[11px] font-medium text-muted-foreground";
const TD = "rule-row py-2.5 text-[13px] tabular-nums text-foreground";

/** 목차 — 안내가 길어서 물으러 온 칸으로 바로 간다. 가로로 흘러 지면 끝까지 쓴다 */
function GuideToc({ ids }: { ids: Set<string> }) {
  return (
    <nav aria-label="안내 목차" className="-mx-6 overflow-x-auto px-6 scrollbar-none">
      <ul className="flex w-max gap-1.5">
        {TOC.filter((t) => ids.has(t.id)).map((t) => (
          <li key={t.id}>
            <a href={`#${t.id}`} className="flex min-h-11 items-center">
              <span className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[13px] font-medium text-foreground">
                {t.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Glance({ evt, cfg, midWkNo }: { evt: PbEvent; cfg: PbClassCfg; midWkNo: number | null }) {
  const trainingWeeks = cfg.totSessCnt - 1;
  const dow = parseEventTime(evt.sttDt).format("dd");
  const facts = [
    { value: `${trainingWeeks}주`, label: `매주 ${dow}요일 공식훈련` },
    { value: `${cfg.totSessCnt}회`, label: "측정까지 출석 회차" },
    { value: `${cfg.fullRfndAttdCnt}회`, label: "나오면 보증금 전액" },
  ];
  return (
    <PbZone id="pb-guide-glance" label="At a Glance" lead={`${trainingWeeks}주 뒤, 10K 기록을 새로 쓰는 클래스예요`}>
      <dl className="grid grid-cols-3 divide-x divide-border rounded-2xl border-[1.5px] border-border py-3">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-1 px-2 text-center">
            <dt className="sr-only">{f.label}</dt>
            <dd className="font-numeric text-2xl font-medium tabular-nums leading-none text-foreground">{f.value}</dd>
            <Micro aria-hidden className="break-keep leading-tight">
              {f.label}
            </Micro>
          </div>
        ))}
      </dl>
      <Bullets
        items={[
          <>
            기간은 <N>{formatPeriod(evt.sttDt, evt.endDt)}</N>이에요.
          </>,
          <>
            1주차{midWkNo !== null ? `·${wkLabel(midWkNo)}` : ""}엔 5K, 마지막 회차엔 10K를 재요. 그 사이는 주마다 다른
            훈련이에요 — 「훈련」 탭에서 주차별 내용과 목적을 볼 수 있어요.
          </>,
          "공식훈련은 앱 벙으로 열려요. 벙에 참석해야 출석으로 인정돼요.",
        ]}
      />
    </PbZone>
  );
}

function Fees({ cfg, mlgAlumni }: { cfg: PbClassCfg; mlgAlumni: boolean }) {
  const dc = cfg.mlgDcAmt > 0;
  return (
    <PbZone id="pb-guide-fees" label="Fees" lead="보증금은 돌려받는 돈, 참가비는 쓰는 돈이에요">
      <div className="flex flex-col rounded-2xl bg-muted/60 px-4 py-1">
        <FeeRow label="보증금" note="출석하면 돌려받아요" amt={cfg.depositAmt} />
        <FeeRow label="참가비" note="돌려주지 않아요" amt={cfg.entryFeeAmt} />
        <div className="flex items-baseline justify-between py-3">
          <Caption className="font-semibold text-foreground">합계</Caption>
          <Body className="font-semibold tabular-nums">{(cfg.depositAmt + cfg.entryFeeAmt).toLocaleString()}원</Body>
        </div>
      </div>
      <Caption className="break-keep leading-relaxed">{PB_MONEY_USE_TXT}.</Caption>
      {dc && (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-2xl px-4 py-3",
            mlgAlumni ? "bg-primary/10" : "border-[1.5px] border-dashed border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <Caption className="font-semibold text-foreground">
              마일리지런 참가자 보증금 −{cfg.mlgDcAmt.toLocaleString()}원
            </Caption>
            {mlgAlumni && <Micro className="shrink-0 font-semibold text-primary">할인 대상이에요</Micro>}
          </div>
          <Caption className="break-keep leading-relaxed">
            할인돼도 {cfg.fullRfndAttdCnt}회 출석하면 낸 보증금 전액을 돌려받아요.
          </Caption>
        </div>
      )}
    </PbZone>
  );
}

function FeeRow({ label, note, amt }: { label: string; note: string; amt: number }) {
  return (
    <div className="rule-row flex items-baseline justify-between gap-3 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <Caption className="font-medium text-foreground">{label}</Caption>
        <Micro>{note}</Micro>
      </span>
      <Body className="tabular-nums">{amt.toLocaleString()}원</Body>
    </div>
  );
}

/**
 * 출석 → 환급 표. 참가자면 **내 보증금·내 기준**으로, 아니면 정식 참가(1주차 합류) 기준으로 그린다 —
 * 마일리지런 할인을 받은 사람이 3만 원 표를 보고 계산하면 틀린다. 금액은 `refundAmt` 한 곳에서.
 */
function Refund({
  cfg,
  mlgAlumni,
  me,
}: {
  cfg: PbClassCfg;
  mlgAlumni: boolean;
  me: PbParticipant | null;
}) {
  const mine = me && !me.summary.late && me.summary.required !== null;
  const deposit = mine ? me.depositAmt : feesForJoinWeek(1, cfg, { mlgAlumni }).depositAmt;
  const required = mine ? me.summary.required! : requiredAttdCnt(1, cfg);
  const rows = required ? Array.from({ length: required }, (_, i) => i + 1) : [];
  const myAttd = mine ? me.summary.attdCnt : null;
  const basis = mine
    ? `내 보증금 ${deposit.toLocaleString()}원 기준`
    : `보증금 ${deposit.toLocaleString()}원 · 1주차 합류 기준`;

  return (
    <PbZone id="pb-guide-refund" label="Attendance & Refund" lead="나온 만큼 돌려받아요">
      <Bullets
        items={[
          <>
            측정까지 <N>{cfg.totSessCnt}회</N> 중 <N>{cfg.fullRfndAttdCnt}회</N> 나오면 보증금을 전액 돌려받아요.
          </>,
          "덜 나오면 출석한 만큼 나눠서 돌려받아요.",
          "한파로 못 한 회차는 모두 불참으로 쳐요. 기준 회차는 그대로예요.",
        ]}
      />
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Micro>{basis}</Micro>
          <dl className="grid grid-cols-2 gap-x-5">
            {rows.map((n) => {
              const full = n === required;
              const now = myAttd !== null && Math.min(myAttd, required!) === n;
              return (
                <div key={n} className={cn("rule-row flex items-baseline justify-between py-2", now && "font-semibold")}>
                  <dt className="text-[13px] tabular-nums text-muted-foreground">
                    출석 {n}회{now && <span className="ml-1 text-primary">· 지금</span>}
                  </dt>
                  <dd className={cn("text-[13px] tabular-nums", full ? "font-semibold text-success" : "text-foreground")}>
                    {refundAmt(deposit, n, required).toLocaleString()}원
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </PbZone>
  );
}

/** 중간 합류 — 주차별 남은 회차·전액 기준. 늦은 합류부터는 한 줄로 접는다 */
function LateJoin({ cfg }: { cfg: PbClassCfg }) {
  const weeks = Array.from({ length: Math.max(0, cfg.lateJoinWkNo - 1) }, (_, i) => i + 1);
  return (
    <PbZone id="pb-guide-join" label="Joining Late" lead="늦게 들어와도 남은 회차만큼 기준이 줄어요">
      <table className="w-full border-collapse">
        <thead>
          <tr className="rule-row">
            <th className={TH}>합류</th>
            <th className={cn(TH, "text-right")}>남은 회차</th>
            <th className={cn(TH, "text-right")}>전액 기준</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((wk) => (
            <tr key={wk}>
              <td className={TD}>{wkLabel(wk)}</td>
              <td className={cn(TD, "text-right")}>{remainingSessCnt(wk, cfg)}회</td>
              <td className={cn(TD, "text-right font-semibold")}>{requiredAttdCnt(wk, cfg) ?? "—"}회</td>
            </tr>
          ))}
          <tr>
            <td className={cn(TD, "text-muted-foreground")}>{wkLabel(cfg.lateJoinWkNo)}~</td>
            <td colSpan={2} className={cn(TD, "text-right text-muted-foreground")}>
              참가비 {formatWon(cfg.entryFeeAmt)}만 · 환급·팀전 없음
            </td>
          </tr>
        </tbody>
      </table>
      <Caption className="break-keep leading-relaxed">
        놓친 회차만큼 기준을 줄이되 내림으로 계산해요 — 늦게 왔다고 손해 보지 않게요.
      </Caption>
    </PbZone>
  );
}

function Groups({ trnGrpCd }: { trnGrpCd: string | null }) {
  const mine = trnGroupOf(trnGrpCd);
  return (
    <PbZone id="pb-guide-groups" label="Training Groups" lead="1주차 5K 기록으로 페이스가 비슷한 사람끼리 묶어요">
      {/* 훈련팀은 알파벳이 아니라 목표 시간으로 부른다 — 표엔 목표기록과 대회 페이스만 둔다(주간 거리는 걷었다) */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="rule-row">
            <th className={cn(TH, "pl-1")}>그룹</th>
            <th className={TH}>10K 목표기록</th>
            <th className={cn(TH, "text-right")}>대회 페이스</th>
          </tr>
        </thead>
        <tbody>
          {PB_TRN_GROUPS.map((g) => {
            const isMine = mine?.cd === g.cd;
            return (
              <tr key={g.cd} className={cn(isMine && "bg-primary/5")}>
                <td className={cn(TD, "pl-1 font-medium")}>
                  {g.nm}
                  {isMine && <span className="mt-0.5 block text-[11px] font-semibold text-primary">내 팀</span>}
                </td>
                <td className={TD}>{`${formatLimit(g.goalSec)} 이내`}</td>
                <td className={cn(TD, "text-right")}>{g.paceTxt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Caption className="break-keep leading-relaxed">
        실력·인원에 따라 합치거나 쪼개요. 중간점검 기록으로 다시 나눌 수 있어요.
      </Caption>
    </PbZone>
  );
}

/** 배점 — `rule.pt` 그대로. 점수 이름은 점수판(`PB_PT_LABEL`)과 같은 말을 쓴다 */
function Scoring({ rule, cfg }: { rule: PbRule; cfg: PbClassCfg }) {
  const { pt } = rule;
  const rows: { pt: string; what: string; how: string }[] = [
    { pt: `+${pt.attend}`, what: "공식훈련 출석", how: "공식훈련·측정 한 번마다" },
    { pt: `+${pt.join}`, what: "일정 참여", how: `공식훈련 밖 앱 벙 · 본인 포함 ${pt.joinMinAttd}명 이상 모인 벙` },
    { pt: `+${pt.host}`, what: "일정 개설", how: `내가 연 벙에 본인 포함 ${pt.hostMinAttd}명 이상 참석` },
    {
      pt: `+${pt.improvePerPct}`,
      what: "기록 향상",
      how: `1% 빨라질 때마다 · 중간점검 최대 ${pt.improveMidMax}점, 최종 최대 ${pt.improveFinalMax}점`,
    },
    { pt: `+${pt.goal}`, what: "목표 달성", how: "측정 10K가 내 목표 이내" },
  ];
  return (
    <PbZone id="pb-guide-score" label="Game Teams & Score" lead="게임팀은 훈련팀과 달라요 — 섞어서 겨뤄요">
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.what} className="rule-row flex items-start gap-3 py-2.5">
            <span className="w-11 shrink-0 font-numeric text-base font-medium tabular-nums text-primary">{r.pt}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <Caption className="font-semibold text-foreground">{r.what}</Caption>
              <Micro className="break-keep leading-snug">{r.how}</Micro>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/60 px-4 py-3.5">
        <Caption className="font-semibold text-foreground">팀 점수</Caption>
        <Caption className="break-keep leading-relaxed text-foreground">
          주마다 팀원 1인당 평균 점수의 합 + 전원 출석 보너스
        </Caption>
        <Micro className="break-keep leading-relaxed">
          합계가 아니라 평균이라 인원이 많다고 유리하지 않아요. 그 주 팀원이 모두 공식훈련에 나오면 +{pt.allAttend}점.
          {wkLabel(cfg.lateJoinWkNo)}부터 합류하면 팀 점수에 들어가지 않아요.
        </Micro>
      </div>
    </PbZone>
  );
}

function GoalRecords({ rule, cfg }: { rule: PbRule; cfg: PbClassCfg }) {
  return (
    <PbZone id="pb-guide-goal" label="Goal & Records" lead="목표도 기록도 내가 직접 올려요">
      <Bullets
        items={[
          <>
            10K 목표는 <N>{formatLimit(rule.goalMaxSec)}</N> 이내로 정해요. <N>{wkLabel(rule.goalEditUntilWk)}</N>까지
            고칠 수 있어요(그 뒤에 합류하면 합류 주차까지).
          </>,
          <>
            기록은 세 번 재요 — 1주차 5K(기준), <N>{wkLabel(rule.midWkNo)}</N> 5K(중간점검), 마지막 10K 측정.
            잰 뒤 「내 현황」에서 직접 올리면 바로 점수에 반영돼요.
          </>,
          <>
            5K 기록 × <N>{rule.tenKFactor}</N>을 10K 기준으로 삼아 최종 향상을 매겨요.
          </>,
          <>
            {wkLabel(cfg.lateJoinWkNo)}부터 합류하면 기록 점수는 없어요. 10K가 목표 이내면 「목표 달성」 배지는 받아요.
          </>,
        ]}
      />
    </PbZone>
  );
}

function Daegu() {
  return (
    <PbZone id="pb-guide-daegu" label="Daegu Marathon" lead="선택이에요 — 팀 점수엔 안 들어가요">
      <Bullets
        items={[
          "대구마라톤 10K는 나가고 싶은 사람만 나가요.",
          "기록은 「내 현황」에서 직접 올려요. 올린 뒤에도 고치거나 지울 수 있어요.",
          "목표 달성·향상 점수는 측정 10K로 매겨요. 대구를 안 뛰어도 손해가 없어요.",
        ]}
      />
    </PbZone>
  );
}

function Settle() {
  return (
    <PbZone id="pb-guide-settle" label="Settlement" lead="돌려주지 않은 돈은 다시 우리에게 써요">
      {/* 쓰임새 문구는 정산 캡션(pb-settlement)과 같은 상수 — 오너가 정한 표현이라 두 곳이 갈라지면 안 된다 */}
      <Bullets
        items={[
          "시즌이 끝나면 출석대로 보증금을 돌려드려요.",
          `${PB_MONEY_USE_TXT}.`,
          `${PB_MONEY_USE_DETAIL_TXT}.`,
        ]}
      />
    </PbZone>
  );
}

/**
 * PB 클래스 안내 — 규칙 전부를 한 지면에.
 *
 * `rule`은 게임 조회에서 오는데 그 조회는 실패할 수 있다(`loadGameSafely`). 그때 배점을
 * 기본값으로 지어내면 관리자가 바꾼 값과 어긋날 수 있어, 그 칸들은 빼고 목차에서도 지운다.
 */
export function PbGuide({
  evt,
  cfg,
  rule,
  mlgAlumni,
  me,
  trnGrpCd,
}: {
  evt: PbEvent;
  cfg: PbClassCfg;
  rule: PbRule | null;
  /** 보는 사람이 마일리지런 참가자인가 — 할인 칸을 「내 얘기」로 칠한다 */
  mlgAlumni: boolean;
  /** 승인·대기 상관없이 참가 행이 있으면 — 환급 표를 내 보증금으로 그린다 */
  me: PbParticipant | null;
  trnGrpCd: string | null;
}) {
  const ids = new Set(TOC.map((t) => t.id));
  if (!rule) {
    ids.delete("pb-guide-score");
    ids.delete("pb-guide-goal");
  }

  return (
    <div className="flex flex-col gap-7">
      <GuideToc ids={ids} />
      <Glance evt={evt} cfg={cfg} midWkNo={rule?.midWkNo ?? null} />
      <Fees cfg={cfg} mlgAlumni={mlgAlumni} />
      <Refund cfg={cfg} mlgAlumni={mlgAlumni} me={me} />
      <LateJoin cfg={cfg} />
      <Groups trnGrpCd={trnGrpCd} />
      {rule && <Scoring rule={rule} cfg={cfg} />}
      {rule && <GoalRecords rule={rule} cfg={cfg} />}
      <Daegu />
      <Settle />
      {!rule && <Caption className="text-center">점수 규칙을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Caption>}
    </div>
  );
}
