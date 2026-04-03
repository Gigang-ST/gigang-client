import { Sparkles } from "lucide-react";

export default function EventsPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 pt-24">
      <Sparkles className="size-12 text-muted-foreground/40" />
      <h1 className="text-lg font-bold text-foreground">이벤트 관리</h1>
      <p className="text-sm text-muted-foreground">준비 중입니다</p>
    </div>
  );
}
