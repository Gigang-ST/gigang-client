import Link from "next/link";
import { notFound } from "next/navigation";

import { dayjs } from "@/lib/dayjs";
import { getMemberDuesDetail } from "@/lib/queries/dues";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, H2, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";

/**
 * 관리자용 회원별 회비 상세 — 원장 드릴다운(QS-7).
 * "이 회원 잔액이 어떤 입금·면제·거래로 만들어졌나"를 시간순으로 보여준다.
 * 개별 건의 정정(확정취소)은 인박스 '처리됨'에서 한다 — 여기는 읽기 전용 근거 화면.
 */
export default async function AdminMemberDuesPage({
  params,
}: {
  params: Promise<{ memId: string }>;
}) {
  const { memId } = await params;
  const detail = await getMemberDuesDetail(memId);
  if (!detail) notFound();

  const { memName, balAmt, lastCalcDt, items } = detail;
  const balColor = balAmt === null ? "" : balAmt < 0 ? "text-destructive" : balAmt > 0 ? "text-success" : "";

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>{memName} 회비 상세</H2>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/dues">원장으로</Link>
        </Button>
      </div>

      <CardItem className="flex items-center justify-between p-4">
        <div className="flex flex-col gap-0.5">
          <Caption>현재 잔액</Caption>
          <Micro>
            {lastCalcDt ? `마지막 재계산 ${dayjs(lastCalcDt).tz("Asia/Seoul").format("YY.MM.DD HH:mm")}` : "재계산 이력 없음"}
          </Micro>
        </div>
        <Body className={cn("text-lg font-bold", balColor)}>
          {balAmt === null ? "—" : `${balAmt > 0 ? "+" : ""}${balAmt.toLocaleString()}원`}
        </Body>
      </CardItem>

      {items.length === 0 ? (
        <EmptyState variant="card" message="기록된 내역이 없습니다." />
      ) : (
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Body className={cn("truncate", it.cancelled && "text-muted-foreground line-through")}>
                  {it.itemLabel}
                </Body>
                <Micro>
                  {dayjs(it.date).format("YY.MM.DD")}
                  {it.note ? ` · ${it.note}` : ""}
                  {it.pending ? " · 잔액 미반영" : ""}
                </Micro>
              </div>
              <Body
                className={cn(
                  "shrink-0 font-semibold",
                  it.cancelled
                    ? "text-muted-foreground line-through"
                    : it.ioLabel === "출금"
                      ? "text-destructive"
                      : it.ioLabel === "면제"
                        ? "text-success"
                        : "",
                )}
              >
                {it.ioLabel === "출금" ? "-" : "+"}
                {it.amt.toLocaleString()}원
                <Micro className="ml-1">{it.ioLabel}</Micro>
              </Body>
            </div>
          ))}
        </CardItem>
      )}

      <Caption className="text-muted-foreground">
        잘못 확정된 건은 처리 화면의 &lsquo;처리됨&rsquo;에서 취소할 수 있습니다.
      </Caption>
    </div>
  );
}
