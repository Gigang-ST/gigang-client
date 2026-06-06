import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";

interface DuesSummaryCardProps {
  balAmt: number | null;
}

export function DuesSummaryCard({ balAmt }: DuesSummaryCardProps) {
  return (
    <Link href="/profile/dues">
      <CardItem className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Wallet className="size-5 text-muted-foreground" />
          <div className="flex flex-col gap-0.5">
            <SectionLabel>회비</SectionLabel>
            {balAmt === null ? (
              <Caption>정산 내역 없음</Caption>
            ) : balAmt > 0 ? (
              <Body className="font-semibold text-primary">
                예치금 +{balAmt.toLocaleString()}원
              </Body>
            ) : balAmt === 0 ? (
              <Caption>납부 완료</Caption>
            ) : (
              <Body className="font-semibold text-destructive">
                미납 {Math.abs(balAmt).toLocaleString()}원
              </Body>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </CardItem>
    </Link>
  );
}
