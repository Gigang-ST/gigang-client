import { Suspense } from "react";
import { requireAdmin } from "@/lib/queries/member";
import { getAllCompetitions } from "@/lib/queries/admin-data";
import { CompetitionsManager } from "@/components/admin/competitions-manager";
import { Skeleton } from "@/components/ui/skeleton";

export default async function CompetitionsPage() {
  await requireAdmin();
  const competitions = await getAllCompetitions();
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 px-6 pt-4">
          <Skeleton className="h-8 w-32 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      }
    >
      <CompetitionsManager initialCompetitions={competitions} />
    </Suspense>
  );
}
