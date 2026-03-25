type SportConfig = {
  key: string;
  label: string;
  chipClass: string;
  dotClass: string;
  eventTypes: string[];
};

const SPORT_CONFIG: SportConfig[] = [
  {
    key: "road_run",
    label: "로드 러닝",
    chipClass: "bg-chart-1 text-foreground",
    dotClass: "bg-chart-1",
    eventTypes: ["3K", "5K", "10K", "HALF", "FULL"],
  },
  {
    key: "ultra",
    label: "울트라마라톤",
    chipClass: "bg-chart-5 text-foreground",
    dotClass: "bg-chart-5",
    eventTypes: ["50K", "80K", "100K", "100M"],
  },
  {
    key: "trail_run",
    label: "트레일 러닝",
    chipClass: "bg-chart-4 text-foreground",
    dotClass: "bg-chart-4",
    eventTypes: ["20K", "50K", "100K", "100M"],
  },
  {
    key: "triathlon",
    label: "철인3종",
    chipClass: "bg-chart-2 text-foreground",
    dotClass: "bg-chart-2",
    eventTypes: ["SPRINT", "OLYMPIC", "HALF", "FULL"],
  },
  {
    key: "cycling",
    label: "사이클",
    chipClass: "bg-chart-3 text-white",
    dotClass: "bg-chart-3",
    eventTypes: ["GRANFONDO", "ROAD RACE", "TIME TRIAL", "CRITERIUM"],
  },
];

const FALLBACK_CONFIG: SportConfig = {
  key: "other",
  label: "기타",
  chipClass: "bg-secondary text-secondary-foreground",
  dotClass: "bg-secondary",
  eventTypes: [],
};

export function resolveSportConfig(sport: string | null): SportConfig {
  if (!sport) {
    return FALLBACK_CONFIG;
  }
  const normalized = sport.toLowerCase();
  return (
    SPORT_CONFIG.find((config) => config.key === normalized) ?? FALLBACK_CONFIG
  );
}

export const SPORT_LEGEND = [...SPORT_CONFIG, FALLBACK_CONFIG];
