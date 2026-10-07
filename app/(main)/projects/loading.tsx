import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 프로젝트 탭 로딩 — 실제 지면과 **같은 머리(78px 고정)·같은 여백(px-6·gap-7)**으로 잡는다.
 * 예전 폴백은 머리 없이 `pt-6 max-w-3xl`이라 본문이 들어오는 순간 지면 전체가 한 번 아래로 밀렸다.
 * 제목은 `decorative` — 스트리밍 HTML 에 폴백·본문 h1 이 둘 다 실리지 않게.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-0" aria-hidden>
      <PageHeader variant="editorial" label="Projects" title="프로젝트" decorative />
      <div className="flex flex-col gap-7 px-6 pb-24">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-[72px] w-full rounded-2xl" />
          <Skeleton className="h-[54px] w-full rounded-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
}
