import { Suspense } from "react";

import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { getRequestTeamContext } from "@/lib/queries/request-team";

import { Skeleton } from "@/components/ui/skeleton";

import { AdminCompetitionsClient } from "./admin-competitions-client";

function CompetitionsFallback() {
  return (
    <div className="flex flex-col gap-4 px-6 pt-4">
      <Skeleton className="h-8 w-32 rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export default async function CompetitionsPage() {
  const [{ teamId }, cmmCdRows] = await Promise.all([
    getRequestTeamContext(),
    getCachedCmmCdRows(),
  ]);
  return (
    <Suspense fallback={<CompetitionsFallback />}>
      <AdminCompetitionsClient teamId={teamId} cmmCdRows={cmmCdRows} />
    </Suspense>
  );
}
