import { Suspense } from "react";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminTitlesClient } from "./admin-titles-client";

function TitlesFallback() {
  return (
    <div className="flex flex-col gap-3 px-6 pt-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export default async function AdminTitlesPage() {
  const [{ teamId }, cmmCdRows] = await Promise.all([
    getRequestTeamContext(),
    getCachedCmmCdRows(),
  ]);

  return (
    <Suspense fallback={<TitlesFallback />}>
      <AdminTitlesClient teamId={teamId} cmmCdRows={cmmCdRows} />
    </Suspense>
  );
}
