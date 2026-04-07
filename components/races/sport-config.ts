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
    chipClass: "bg-sport-road-run text-foreground",
    dotClass: "bg-sport-road-run",
    eventTypes: ["5K", "10K", "HALF", "FULL"],
  },
  {
    key: "ultra",
    label: "울트라마라톤",
    chipClass: "bg-sport-ultra text-foreground",
    dotClass: "bg-sport-ultra",
    eventTypes: ["50K", "80K", "100K", "100M"],
  },
  {
    key: "trail_run",
    label: "트레일 러닝",
    chipClass: "bg-sport-trail-run text-foreground",
    dotClass: "bg-sport-trail-run",
    eventTypes: ["20K", "50K", "100K", "100M"],
  },
  {
    key: "triathlon",
    label: "철인3종",
    chipClass: "bg-sport-triathlon text-foreground",
    dotClass: "bg-sport-triathlon",
    eventTypes: ["SPRINT", "OLYMPIC", "HALF", "FULL"],
  },
  {
    key: "cycling",
    label: "사이클",
    chipClass: "bg-sport-cycling text-white",
    dotClass: "bg-sport-cycling",
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
