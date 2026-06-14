import { Newspaper } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Body, Caption } from "@/components/common/typography";

export default function StoryPage() {
  return (
    <div className="flex flex-col gap-0">
      <PageHeader title="기강이야기" />
      <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
          <Newspaper className="size-8 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Body className="font-semibold">곧 오픈됩니다.</Body>
          <Caption>기강 멤버들의 기록과 이야기를<br />이곳에서 만나볼 수 있어요.</Caption>
        </div>
      </div>
    </div>
  );
}
