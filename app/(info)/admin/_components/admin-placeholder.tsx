import { H2 } from "@/components/common/typography";

export function AdminPlaceholder({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 pt-24">
      <Icon className="size-12 text-muted-foreground/40" />
      <H2>{title}</H2>
      <p className="text-sm text-muted-foreground">준비 중입니다</p>
    </div>
  );
}
