export const FRAME_CSS: Record<string, string> = {
  "frame-none": "", "frame-subtle": "card-frame-subtle",
  "frame-soft-white": "card-frame-soft-white", "frame-silver": "card-frame-silver",
  "frame-bronze": "card-frame-bronze", "frame-neon": "card-frame-neon",
  "frame-emerald": "card-frame-emerald", "frame-sapphire": "card-frame-sapphire",
  "frame-ice": "card-frame-ice", "frame-gold": "card-frame-gold",
  "frame-aurora": "card-frame-aurora", "frame-shimmer": "card-frame-shimmer",
  "frame-dusk": "card-frame-dusk", "frame-crimson": "card-frame-crimson",
  "frame-fire": "card-frame-fire", "frame-void": "card-frame-void",
  "frame-obsidian": "card-frame-obsidian", "frame-glitch": "card-frame-glitch",
  "frame-scan": "card-frame-scan", "frame-lightning": "card-frame-lightning",
  "frame-heartbeat": "card-frame-heartbeat", "frame-rainbow": "card-frame-rainbow",
  "frame-plasma": "card-frame-plasma",
};

export function getFrameCls(frameCd: string | null | undefined): string {
  if (!frameCd) return "";
  return FRAME_CSS[frameCd] ?? "";
}
