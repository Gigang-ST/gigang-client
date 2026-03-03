"use client";

import { useState } from "react";

type RankingEntry = {
  rank: number;
  name: string;
  record: string;
  raceName: string | null;
  utmbProfileUrl: string | null;
};

type EventData = {
  eventType: string;
  label: string;
  male: RankingEntry[];
  female: RankingEntry[];
};

export function RecordsClient({ data }: { data: EventData[] }) {
  const [selectedEvent, setSelectedEvent] = useState(
    data[0]?.eventType ?? "5K",
  );
  const [selectedGender, setSelectedGender] = useState<"male" | "female">(
    "male",
  );

  const current = data.find((d) => d.eventType === selectedEvent);
  const entries =
    selectedGender === "male" ? current?.male : current?.female;
  const isUtmb = selectedEvent === "UTMB";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {data.map((evt) => (
          <button
            key={evt.eventType}
            type="button"
            onClick={() => setSelectedEvent(evt.eventType)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedEvent === evt.eventType
                ? "bg-foreground text-background"
                : "bg-black/10 text-black/70 hover:bg-black/15"
            }`}
          >
            {evt.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSelectedGender("male")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            selectedGender === "male"
              ? "bg-blue-600 text-white"
              : "bg-black/10 text-black/70 hover:bg-black/15"
          }`}
        >
          남자
        </button>
        <button
          type="button"
          onClick={() => setSelectedGender("female")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            selectedGender === "female"
              ? "bg-rose-500 text-white"
              : "bg-black/10 text-black/70 hover:bg-black/15"
          }`}
        >
          여자
        </button>
      </div>

      {entries && entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs text-black/90">
            <thead>
              <tr className="border-b border-black/15 text-left text-[11px] text-black/50">
                <th className="w-[24px] pb-1.5 pr-1.5">#</th>
                <th className="w-[52px] pb-1.5 pr-1.5">이름</th>
                <th className="w-[60px] pb-1.5 pr-1.5">
                  {isUtmb ? "Index" : "기록"}
                </th>
                {isUtmb ? (
                  <th className="pb-1.5">프로필</th>
                ) : (
                  <th className="pb-1.5">대회</th>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={`${entry.rank}-${entry.name}`}
                  className="border-b border-black/5"
                >
                  <td className="py-2 pr-1.5 font-semibold">
                    {entry.rank === 1
                      ? "\u{1F947}"
                      : entry.rank === 2
                        ? "\u{1F948}"
                        : entry.rank === 3
                          ? "\u{1F949}"
                          : entry.rank}
                  </td>
                  <td className="truncate py-2 pr-1.5 font-medium">{entry.name}</td>
                  <td className="py-2 pr-1.5 font-mono font-semibold">{entry.record}</td>
                  {isUtmb ? (
                    <td className="py-2">
                      {entry.utmbProfileUrl ? (
                        <a
                          href={entry.utmbProfileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 underline font-medium"
                        >
                          UTMB
                        </a>
                      ) : (
                        <span className="text-black/40">-</span>
                      )}
                    </td>
                  ) : (
                    <td className="truncate py-2 text-black/60">
                      {entry.raceName ?? "-"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-black/50">
          아직 등록된 기록이 없습니다.
        </p>
      )}
    </div>
  );
}
