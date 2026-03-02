type SportConfig = {
  key: string;
  label: string;
  chipClass: string;
  dotClass: string;
};

const SPORT_CONFIG: SportConfig[] = [
  {
    key: "road_run",
    label: "로드 러닝",
    chipClass: "bg-chart-1 text-foreground",
    dotClass: "bg-chart-1",
  },
  {
    key: "trail_run",
    label: "트레일 러닝",
    chipClass: "bg-chart-4 text-foreground",
    dotClass: "bg-chart-4",
  },
  {
    key: "triathlon",
    label: "철인3종",
    chipClass: "bg-chart-2 text-foreground",
    dotClass: "bg-chart-2",
  },
  {
    key: "cycling",
    label: "사이클",
    chipClass: "bg-chart-3 text-white",
    dotClass: "bg-chart-3",
  },
];

const FALLBACK_CONFIG: SportConfig = {
  key: "other",
  label: "기타",
  chipClass: "bg-secondary text-secondary-foreground",
  dotClass: "bg-secondary",
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
