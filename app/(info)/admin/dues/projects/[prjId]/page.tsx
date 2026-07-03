import Link from "next/link";
import { notFound } from "next/navigation";

import { dayjs } from "@/lib/dayjs";
import { getProjectDetail } from "@/lib/queries/dues";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, H2, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";

import { ProjectCancelButton } from "./project-cancel-button";
import { ProjectStatusButton } from "./project-status-button";

/**
 * 프로젝트(모금) 상세 — 참여자 명단·모금액 (SP2).
 * 귀속된 확정 거래만 집계한다(인박스에 남은 미확정 귀속은 제외).
 * 개별 건 정정은 처리 화면의 '처리됨'에서.
 */
export default async function DuesProjectDetailPage({
  params,
}: {
  params: Promise<{ prjId: string }>;
}) {
  const { prjId } = await params;
  const detail = await getProjectDetail(prjId);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>{detail.name}</H2>
        <div className="flex items-center gap-2">
          <ProjectStatusButton prjId={detail.prjId} stCd={detail.stCd} />
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/dues/projects">목록</Link>
          </Button>
        </div>
      </div>
      {detail.memo && <Caption>{detail.memo}</Caption>}

      <CardItem className="flex items-center justify-between p-4">
        <div className="flex flex-col gap-0.5">
          <Caption>모금액 (확정 기준)</Caption>
          <Micro>
            {detail.stCd === "active" ? "모금 중 — 거래 처리에서 귀속 가능" : "마감됨"} ·{" "}
            {detail.rows.length}건
          </Micro>
        </div>
        <Body className="text-lg font-bold">{detail.totalAmt.toLocaleString()}원</Body>
      </CardItem>

      {detail.rows.length === 0 ? (
        <EmptyState
          variant="card"
          message="아직 귀속된 거래가 없습니다. 거래내역 처리에서 분류를 '프로젝트'로 지정해 보세요."
        />
      ) : (
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          {detail.rows.map((r) => (
            <div key={r.txnId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Body className="truncate font-semibold">{r.memName ?? r.rawName}</Body>
                <Micro>
                  {dayjs(r.txnDt).format("YY.MM.DD")}
                  {r.memName && r.memName !== r.rawName ? ` · 입금자명 ${r.rawName}` : ""}
                  {!r.memName ? " · 회원 미매칭" : ""}
                </Micro>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Body
                  className={cn("font-semibold", r.io === "withdrawal" && "text-destructive")}
                >
                  {r.io === "withdrawal" ? "-" : "+"}
                  {r.amt.toLocaleString()}원
                </Body>
                <ProjectCancelButton txnId={r.txnId} rawName={r.rawName} amt={r.amt} />
              </div>
            </div>
          ))}
        </CardItem>
      )}

      <Caption className="text-muted-foreground">
        취소하면 거래가 처리 대기(인박스)로 돌아가고, 분류·회원은 그대로 남아 다시 처리할 수 있습니다.
      </Caption>
    </div>
  );
}
