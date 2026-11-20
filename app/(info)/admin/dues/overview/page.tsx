import { H2, Caption, Micro, SectionLabel } from "@/components/common/typography";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDuesOverview } from "@/lib/queries/dues";
import { cn } from "@/lib/utils";

const won = (n: number) => `${n.toLocaleString()}원`;

type RowData = { key?: string; label: string; hint?: string; value: string; strong?: boolean };

/** 항목·금액 표 — 회원 관리 화면과 같은 표 모양(테두리 래퍼 + ui/table). 금액은 오른쪽 정렬·줄바꿈 금지. */
function DuesTable({ rows }: { rows: RowData[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">항목</TableHead>
            <TableHead className="text-right text-xs whitespace-nowrap">금액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key ?? r.label}>
              <TableCell className="whitespace-normal align-top">
                <Caption className={cn("block text-xs text-foreground", r.strong && "font-semibold")}>{r.label}</Caption>
                {r.hint && <Micro className="block">{r.hint}</Micro>}
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">
                <Caption className={cn("text-xs whitespace-nowrap text-foreground", r.strong && "font-semibold")}>{r.value}</Caption>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** 통장 전체 잔액·명목별 현황(#706) — 통장 잔액 = 프로젝트 보유액 + 예치금 + 운영자금·공금 순액 + 자유 회비. */
export default async function DuesOverviewPage() {
  const o = await getDuesOverview();
  const mismatch = o.freeFund !== null && o.freeFund < 0;

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <H2>잔액 현황</H2>

      <div className="flex flex-col gap-2">
        <SectionLabel>BANK BALANCE</SectionLabel>
        <DuesTable
          rows={[
            o.bankBalance === null
              ? { label: "통장 잔액", hint: "아직 기록이 없어요. 거래후잔액이 든 엑셀을 올리면 채워져요.", value: "미기록", strong: true }
              : { label: "통장 잔액", hint: `${o.bankAsOfDt} 마지막 거래 후 잔액`, value: won(o.bankBalance), strong: true },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>BREAKDOWN</SectionLabel>
        <DuesTable
          rows={[
            { label: "프로젝트 보유액", hint: "프로젝트별 합계(아래)", value: won(o.projectTotal) },
            { label: "예치금 합계", hint: `미리 낸 회원 ${o.prepaidCount}명`, value: won(o.prepaidTotal) },
            {
              label: "운영자금·공금 순액",
              hint: "운영자금 입출금·공금 반환(입금 − 출금) · 회비도 프로젝트도 아님",
              value: won(o.operatorFundNet),
            },
            {
              label: "자유 회비",
              hint: "통장 잔액에서 위 셋을 뺀 나머지",
              value: o.freeFund === null ? "계산 불가" : won(o.freeFund),
              strong: true,
            },
          ]}
        />
        {o.freeFund === null ? (
          <Caption>통장 잔액이 기록돼야 자유 회비와 대조를 볼 수 있어요.</Caption>
        ) : mismatch ? (
          <Caption className="text-destructive">
            어긋남 — 프로젝트·예치금·운영자금·공금을 합치면 통장 잔액보다 {won(-o.freeFund)} 많아요. 거래 분류나 개시잔액을 확인하세요.
          </Caption>
        ) : (
          <Caption>프로젝트 + 예치금 + 운영자금·공금 + 자유 회비 = 통장 잔액 (음수 없이 맞아요)</Caption>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>PROJECTS</SectionLabel>
        {o.projects.length === 0 ? (
          <Caption>프로젝트가 없어요.</Caption>
        ) : (
          <DuesTable
            rows={o.projects.map((p) => ({
              key: p.prjId,
              label: p.name,
              hint: p.stCd === "closed" ? `정산 완료 · 남은 돈 ${won(p.remainingAmt)}은 자유 회비로` : "모금 중 · 모금 − 지출",
              value: won(p.amt),
            }))}
          />
        )}
        <Caption>
          프로젝트 보유액 = 모금 − 프로젝트에 귀속한 지출이에요. 지출을 프로젝트에 귀속하지 않으면 자유 회비에서 빠진 것으로 계산돼요. 마감한 프로젝트는 정산 완료로 보고 0으로 표시해요.
        </Caption>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>REFERENCE</SectionLabel>
        <DuesTable
          rows={[{ label: "미납 합계", hint: `미납 회원 ${o.unpaidCount}명 · 통장 잔액에 들어 있지 않은 돈`, value: won(o.unpaidTotal) }]}
        />
      </div>
    </div>
  );
}
