import { H2, Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { getDuesOverview } from "@/lib/queries/dues";
import { cn } from "@/lib/utils";

const won = (n: number) => `${n.toLocaleString()}원`;

function Row({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Body className={cn(strong && "font-semibold")}>{label}</Body>
        {hint && <Micro>{hint}</Micro>}
      </div>
      <Body className={cn("shrink-0", strong && "font-semibold")}>{value}</Body>
    </div>
  );
}

/** 통장 전체 잔액·명목별 현황(#706) — 통장 잔액 = 프로젝트 보유액 + 예치금 + 자유 회비. */
export default async function DuesOverviewPage() {
  const o = await getDuesOverview();
  const mismatch = o.freeFund !== null && o.freeFund < 0;

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <H2>잔액 현황</H2>

      <div className="flex flex-col gap-2">
        <SectionLabel>BANK BALANCE</SectionLabel>
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          {o.bankBalance === null ? (
            <Row label="통장 잔액" hint="아직 기록이 없어요. 거래후잔액이 든 엑셀을 올리면 채워져요." value="미기록" strong />
          ) : (
            <Row label="통장 잔액" hint={`${o.bankAsOfDt} 마지막 거래 후 잔액`} value={won(o.bankBalance)} strong />
          )}
        </CardItem>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>BREAKDOWN</SectionLabel>
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          <Row label="프로젝트 보유액" hint="프로젝트별 합계(아래)" value={won(o.projectTotal)} />
          <Row label="예치금 합계" hint={`미리 낸 회원 ${o.prepaidCount}명`} value={won(o.prepaidTotal)} />
          <Row
            label="자유 회비"
            hint="통장 잔액에서 위 둘을 뺀 나머지"
            value={o.freeFund === null ? "계산 불가" : won(o.freeFund)}
            strong
          />
        </CardItem>
        {o.freeFund === null ? (
          <Caption>통장 잔액이 기록돼야 자유 회비와 대조를 볼 수 있어요.</Caption>
        ) : mismatch ? (
          <Caption className="text-destructive">
            어긋남 — 프로젝트와 예치금을 합치면 통장 잔액보다 {won(-o.freeFund)} 많아요. 거래 분류나 개시잔액을 확인하세요.
          </Caption>
        ) : (
          <Caption>프로젝트 + 예치금 + 자유 회비 = 통장 잔액 (음수 없이 맞아요)</Caption>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>PROJECTS</SectionLabel>
        {o.projects.length === 0 ? (
          <Caption>프로젝트가 없어요.</Caption>
        ) : (
          <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
            {o.projects.map((p) => (
              <Row
                key={p.prjId}
                label={p.name}
                hint={p.stCd === "closed" ? "마감" : "모금 중"}
                value={won(p.amt)}
              />
            ))}
          </CardItem>
        )}
        <Caption>
          지출이 프로젝트에 귀속되기 전이라(#707) 지금은 모금액(입금 − 귀속된 출금) 기준이에요. 이미 쓴 돈이 남아 있는 것처럼 보일 수 있어요.
        </Caption>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>REFERENCE</SectionLabel>
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          <Row label="미납 합계" hint={`미납 회원 ${o.unpaidCount}명 · 통장 잔액에 들어 있지 않은 돈`} value={won(o.unpaidTotal)} />
        </CardItem>
      </div>
    </div>
  );
}
