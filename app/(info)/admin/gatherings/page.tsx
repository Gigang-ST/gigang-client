import { Suspense } from "react";

import { getRequestTeamContext } from "@/lib/queries/request-team";

import { Skeleton } from "@/components/ui/skeleton";

import { AdminGatheringsClient } from "./admin-gatherings-client";

function GatheringsFallback() {
  return (
    <div className="flex flex-col gap-4 px-6 pt-4">
      <Skeleton className="h-8 w-32 rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export default async function AdminGatheringsPage() {
  const { teamId } = await getRequestTeamContext();
  return (
    <Suspense fallback={<GatheringsFallback />}>
      <AdminGatheringsClient teamId={teamId} />
    </Suspense>
  );
}
