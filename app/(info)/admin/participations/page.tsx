import { HandCoins } from "lucide-react";
import { H2 } from "@/components/common/typography";

export default function ParticipationsPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 pt-24">
      <HandCoins className="size-12 text-muted-foreground/40" />
      <H2>참여자 관리</H2>
      <p className="text-sm text-muted-foreground">준비 중입니다</p>
    </div>
  );
}
