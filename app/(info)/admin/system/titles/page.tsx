import { Suspense } from "react";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminTitlesClient } from "./admin-titles-client";
import { AdminEffectsClient } from "./admin-effects-client";
import { AdminTitlesPageClient } from "./admin-titles-page-client";
import { AdminTitleHistoryClient } from "./admin-title-history-client";

function Fallback() {
  return (
    <div className="flex flex-col gap-3 px-6 pt-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

async function TitlesTabContent() {
  const [{ teamId }, cmmCdRows] = await Promise.all([
    getRequestTeamContext(),
    getCachedCmmCdRows(),
  ]);
return <AdminTitlesClient teamId={teamId} cmmCdRows={cmmCdRows} />;
}

export default function AdminTitlesPage() {
  return (
    <AdminTitlesPageClient
      titlesContent={
        <Suspense fallback={<Fallback />}>
          <TitlesTabContent />
        </Suspense>
      }
      effectsContent={<AdminEffectsClient />}
      historyContent={<AdminTitleHistoryClient />}
    />
  );
}
