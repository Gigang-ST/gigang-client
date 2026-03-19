import { Skeleton } from "@/components/ui/skeleton";

function MainLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex h-14 items-center px-6">
        <Skeleton className="h-7 w-28" />
      </div>

      <div className="flex flex-col gap-7 px-6 pb-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3.5 w-28" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>

        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <MainLoadingSkeleton />;
}

