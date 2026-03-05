import { CompetitionCalendar } from "@/components/races/competition-calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Suspense } from "react";

async function RacesContent() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-16 pt-20 text-white md:px-8 md:pt-28">
      <div className="flex flex-col gap-6">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-white/60">
            Race Calendar
          </p>
          <h1 className="text-3xl font-bold md:text-4xl">대회참여</h1>
        </div>

        <Card className="bg-white/35 text-foreground shadow-xl backdrop-blur-xl border-white/20">
          <CardContent className="p-0">
            <CompetitionCalendar />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function RacesPage() {
  return (
    <Suspense>
      <RacesContent />
    </Suspense>
  );
}
