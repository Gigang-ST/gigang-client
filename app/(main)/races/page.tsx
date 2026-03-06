import { RaceListView } from "@/components/races/race-list-view";

export default function RacesPage() {
  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex h-14 items-center px-6">
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
          대회
        </h1>
      </div>
      <RaceListView />
    </div>
  );
}
