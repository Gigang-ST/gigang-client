import { FolderKanban } from "lucide-react";
import { H2 } from "@/components/common/typography";

export default function ProjectsPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 pt-24">
      <FolderKanban className="size-12 text-muted-foreground/40" />
      <H2>프로젝트 관리</H2>
      <p className="text-sm text-muted-foreground">준비 중입니다</p>
    </div>
  );
}
