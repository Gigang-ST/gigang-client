import { Sparkles } from "lucide-react";
import { H2 } from "@/components/common/typography";

export default function EventsPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 pt-24">
      <Sparkles className="size-12 text-muted-foreground/40" />
      <H2>이벤트 관리</H2>
      <p className="text-sm text-muted-foreground">준비 중입니다</p>
    </div>
  );
}
