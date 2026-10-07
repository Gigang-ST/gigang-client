"use client";

import type { PbClassCfg } from "@/lib/pb-class";

import { Caption } from "@/components/common/typography";
import { Input } from "@/components/ui/input";

/** 입력 중에는 빈 문자열도 허용해야 해서 폼 상태는 문자열로 든다 — 저장 시 `parsePbCfgForm`이 숫자로 바꾼다 */
export type PbCfgForm = Record<keyof PbClassCfg, string>;

export function toPbCfgForm(cfg: PbClassCfg): PbCfgForm {
  return {
    totSessCnt: String(cfg.totSessCnt),
    fullRfndAttdCnt: String(cfg.fullRfndAttdCnt),
    lateJoinWkNo: String(cfg.lateJoinWkNo),
    depositAmt: String(cfg.depositAmt),
    entryFeeAmt: String(cfg.entryFeeAmt),
    mlgDcAmt: String(cfg.mlgDcAmt),
  };
}

/**
 * 폼 → 설정값. 잘못된 칸이 있으면 사람이 읽을 사유를 돌려준다.
 *
 * 서버(zod)가 최종 검증을 하지만 여기서 먼저 막는 건 "저장 눌렀는데 아무 일도 안 일어난" 느낌을
 * 없애기 위해서다. 전액 기준이 총 회차를 넘으면 환급 기준을 채울 방법이 없어 모두가 비례 환급이 된다.
 */
export function parsePbCfgForm(form: PbCfgForm): { cfg: PbClassCfg } | { error: string } {
  const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);
  const cfg: PbClassCfg = {
    totSessCnt: toInt(form.totSessCnt),
    fullRfndAttdCnt: toInt(form.fullRfndAttdCnt),
    lateJoinWkNo: toInt(form.lateJoinWkNo),
    depositAmt: toInt(form.depositAmt),
    entryFeeAmt: toInt(form.entryFeeAmt),
    mlgDcAmt: toInt(form.mlgDcAmt),
  };
  if (Object.values(cfg).some((n) => Number.isNaN(n))) return { error: "설정 칸은 0 이상의 정수로 입력해 주세요" };
  if (cfg.totSessCnt < 2) return { error: "총 회차는 2회 이상이어야 합니다" };
  if (cfg.fullRfndAttdCnt < 1 || cfg.fullRfndAttdCnt > cfg.totSessCnt) {
    return { error: "전액 환급 기준 출석은 1회 이상, 총 회차 이하여야 합니다" };
  }
  if (cfg.lateJoinWkNo < 2) return { error: "늦은 합류 시작 주차는 2주차 이상이어야 합니다" };
  // `feesForJoinWeek`가 보증금 한도로 조용히 깎아 주긴 하지만, 0을 하나 더 친 오타(50000)를
  // 말없이 받아 주면 운영자가 할인이 그만큼 적용된다고 믿는다 — 저장 전에 알려 준다.
  if (cfg.mlgDcAmt > cfg.depositAmt) return { error: "마일리지런 할인은 보증금을 넘을 수 없습니다" };
  return { cfg };
}

type FieldDef = { key: keyof PbClassCfg; label: string; unit: string; hint?: string };

const FIELDS: FieldDef[] = [
  {
    key: "totSessCnt",
    label: "총 회차",
    unit: "회",
    hint: "공식훈련 + 측정 1회. 바꾸면 종료일도 함께 바뀌어요",
  },
  { key: "fullRfndAttdCnt", label: "전액 환급 기준 출석", unit: "회", hint: "정식 참가자 기준" },
  {
    key: "lateJoinWkNo",
    label: "늦은 합류 시작 주차",
    unit: "주차",
    hint: "이 주차부터 합류하면 보증금 없이 참가비만 내요",
  },
  { key: "depositAmt", label: "보증금", unit: "원" },
  {
    key: "mlgDcAmt",
    label: "마일리지런 참가자 보증금 할인",
    unit: "원",
    hint: "마일리지런에 참가했던 멤버는 보증금에서 이만큼 깎아요. 환급은 실제로 낸 보증금 기준이에요",
  },
  { key: "entryFeeAmt", label: "참가비", unit: "원", hint: "돌려주지 않는 금액" },
];

/** PB 클래스 설정 6칸 — 프로젝트 정보 폼 안에 이어 붙는다 */
export function PbCfgFields({
  value,
  onChange,
}: {
  value: PbCfgForm;
  onChange: (next: PbCfgForm) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-border p-4">
      <span className="text-sm font-semibold text-foreground">PB 클래스 설정</span>
      {FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <label htmlFor={`pb-cfg-${f.key}`} className="text-sm font-medium text-foreground">
            {f.label}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={`pb-cfg-${f.key}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={value[f.key]}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
            <Caption className="w-10 shrink-0">{f.unit}</Caption>
          </div>
          {f.hint && <Caption>{f.hint}</Caption>}
        </div>
      ))}
    </div>
  );
}
