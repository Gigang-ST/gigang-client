import { Caption } from "@/components/common/typography";
import { AccountCopyButton } from "@/components/projects/account-copy-button";
import { CardItem } from "@/components/ui/card";

/**
 * 신청 완료 · 입금 확인 대기 — 마일리지런의 대기 카드와 같은 문구 톤.
 *
 * 입금액은 **참가자 행에 저장된 금액**이다(서버가 신청 시점 주차로 확정한 값). 화면이 주차를
 * 다시 계산해 보여 주면 주 경계를 넘긴 사람이 신청 화면에서 본 금액과 다른 금액을 보게 된다.
 */
export function PbPendingCard({ amount }: { amount: number }) {
  return (
    <CardItem className="flex flex-col gap-4 p-5">
      <div className="text-center">
        <Caption className="mb-1 block font-semibold text-foreground">참가 신청 완료!</Caption>
        <Caption>운영진 승인을 기다려주세요.</Caption>
      </div>
      <div className="flex flex-col gap-3 rounded-xl bg-muted p-4">
        <div className="text-center">
          <Caption className="mb-1 block font-semibold text-foreground">
            모임 계좌로 {amount.toLocaleString()}원을 입금해 주세요
          </Caption>
          <Caption>입금 확인 후 승인이 진행됩니다.</Caption>
        </div>
        <AccountCopyButton />
      </div>
    </CardItem>
  );
}
