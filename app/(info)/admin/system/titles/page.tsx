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

// 이펙트 등급·사용 여부·해금 조건은 팀별(team_effect_cfg) — 접속한 팀을 서버에서 정해 넘긴다
async function EffectsTabContent() {
  const { teamId } = await getRequestTeamContext();
  return <AdminEffectsClient teamId={teamId} />;
}

export default function AdminTitlesPage() {
  return (
    <AdminTitlesPageClient
      titlesContent={
        <Suspense fallback={<Fallback />}>
          <TitlesTabContent />
        </Suspense>
      }
      effectsContent={
        <Suspense fallback={<Fallback />}>
          <EffectsTabContent />
        </Suspense>
      }
      historyContent={<AdminTitleHistoryClient />}
    />
  );
}
