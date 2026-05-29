"use client";

import { useEffect, useState, useTransition } from "react";

import { Check, Lock, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { FRAME_CSS } from "@/lib/title-effects";

import { setPrimaryTitle, setSelectedEffect } from "@/app/actions/profile/update-collection";

/* ------------------------------------------------------------------ */
/*  타입                                                                */
/* ------------------------------------------------------------------ */

type AllTitle = {
  ttl_id: string;
  ttl_nm: string;
  ttl_desc: string | null;
  rarity_level: number;
  ttl_ctgr_cd: string;
  ttl_group_cd: number | null;
};

type EffectRow = {
  effect_cd: string;
  effect_nm: string;
  effect_type: "badge" | "frame";
  rarity_level: number;
  use_yn: boolean;
};

type Tab = "title" | "badge" | "frame";

/* ------------------------------------------------------------------ */
/*  배지 CSS 매핑                                                       */
/* ------------------------------------------------------------------ */

const BADGE_CSS: Record<string, string> = {
  none: "", dim: "title-effect-dim", breathe: "title-effect-breathe",
  "italic-drift": "title-effect-italic-drift", "dot-blink": "title-effect-dot-blink",
  "glow-soft": "title-effect-glow-soft", "soft-shine": "title-effect-soft-shine",
  silver: "title-effect-silver", "underline-fade": "title-effect-underline-fade",
  flare: "title-effect-flare", bronze: "title-effect-bronze", neon: "title-effect-neon",
  emerald: "title-effect-emerald", sapphire: "title-effect-sapphire",
  gold: "title-effect-gold", ice: "title-effect-ice", pearl: "title-effect-pearl",
  titanium: "title-effect-titanium", hologram: "title-effect-hologram",
  "aurora-text": "title-effect-aurora-text", "pulse-color": "title-effect-pulse-color",
  "void-text": "title-effect-void-text", ruby: "title-effect-ruby",
  amethyst: "title-effect-amethyst", fire: "title-effect-fire",
  rainbow: "title-effect-rainbow", plasma: "title-effect-plasma",
  lava: "title-effect-lava", crimson: "title-effect-crimson",
  matrix: "title-effect-matrix", glitch: "title-effect-glitch",
  chromatic: "title-effect-chromatic", wave: "title-effect-wave",
  zoom: "title-effect-zoom", bounce: "title-effect-bounce",
  shake: "title-effect-shake", flip: "title-effect-flip",
  typewriter: "title-effect-typewriter",
  "bounce-rainbow": "title-effect-bounce-rainbow", "bounce-ice": "title-effect-bounce-ice",
  "shake-fire": "title-effect-shake-fire", "wave-hologram": "title-effect-wave-hologram",
  "flip-gold": "title-effect-flip-gold", obsidian: "title-effect-obsidian",
  "shake-lava": "title-effect-shake-lava", "zoom-plasma": "title-effect-zoom-plasma",
  "zoom-rainbow": "title-effect-zoom-rainbow", "wave-fire": "title-effect-wave-fire",
  spark: "title-effect-spark",
};

// 이펙트별 테두리+텍스트 색상
const BADGE_BORDER: Record<string, string> = {
  none: "border-zinc-700 text-zinc-300",
  dim: "border-zinc-600", breathe: "border-zinc-500",
  "italic-drift": "border-zinc-600", "dot-blink": "border-zinc-600",
  "glow-soft": "border-zinc-500", "soft-shine": "border-slate-400/60",
  silver: "border-slate-400/60", "underline-fade": "border-sky-400/40",
  flare: "border-sky-400/50", bronze: "border-amber-700/60",
  neon: "border-sky-400/60 text-sky-400", emerald: "border-emerald-500/50",
  sapphire: "border-blue-500/50", gold: "border-amber-400/50",
  ice: "border-cyan-400/50", pearl: "border-slate-300/60",
  titanium: "border-slate-500/50", hologram: "border-violet-400/50",
  "aurora-text": "border-emerald-400/50", "pulse-color": "border-violet-400/50",
  "void-text": "border-indigo-500/50", ruby: "border-rose-500/50",
  amethyst: "border-purple-500/50", fire: "border-orange-500/60",
  rainbow: "border-pink-400/50", plasma: "border-fuchsia-500/50",
  lava: "border-red-600/60", crimson: "border-red-500/60",
  matrix: "border-green-500/50 text-green-400",
  glitch: "border-slate-500 text-slate-200",
  chromatic: "border-slate-500", wave: "border-sky-400/50",
  zoom: "border-fuchsia-400/50", bounce: "border-orange-400/50 text-orange-400",
  shake: "border-red-400/50 text-red-400", flip: "border-violet-400/50",
  typewriter: "border-green-400/50 text-green-400",
  "bounce-rainbow": "border-pink-400/50", "bounce-ice": "border-cyan-400/50",
  "shake-fire": "border-orange-500/60", "wave-hologram": "border-violet-400/50",
  "flip-gold": "border-amber-400/50", obsidian: "border-indigo-500/50",
  "shake-lava": "border-red-600/60", "zoom-plasma": "border-fuchsia-500/60",
  "zoom-rainbow": "border-pink-400/60", "wave-fire": "border-orange-500/60",
  spark: "border-violet-400/50 text-violet-300",
};

/* ------------------------------------------------------------------ */
/*  BadgePreview                                                        */
/* ------------------------------------------------------------------ */

function BadgePreview({ effectCd, name }: { effectCd: string; name: string }) {
  const cls = BADGE_CSS[effectCd] ?? "";
  const border = BADGE_BORDER[effectCd] ?? "border-zinc-700 text-zinc-300";
  return (
    <span className={cn("inline-flex items-center rounded-full border bg-zinc-900 px-2 py-0.5 text-[11px] font-medium", border)}>
      {effectCd === "glitch"
        ? <span className={cn("inline-block", cls)} data-text={name}>{name}</span>
        : cls ? <span className={cn("inline-block", cls)}>{name}</span>
        : name
      }
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  CollectionSheet                                                     */
/* ------------------------------------------------------------------ */

export function CollectionSheet({
  open,
  onClose,
  teamMemId,
  teamId,
  currentPrimaryTtlId,
  currentBadgeEffect,
  currentFrameCd,
  maxRarityLevel,
  memberName,
}: {
  open: boolean;
  onClose: () => void;
  teamMemId: string;
  teamId: string;
  currentPrimaryTtlId: string | null;
  currentBadgeEffect: string | null;
  currentFrameCd: string | null;
  maxRarityLevel: number;
  memberName: string;
}) {
  const [tab, setTab] = useState<Tab>("title");
  const [ownedTitleIds, setOwnedTitleIds] = useState<Set<string>>(new Set());
  const [allTitles, setAllTitles] = useState<AllTitle[]>([]);
  const [allEffects, setAllEffects] = useState<EffectRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedTtlId, setSelectedTtlId] = useState<string | null>(currentPrimaryTtlId);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(currentBadgeEffect);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(currentFrameCd);
  // 설명 보기 전용 — 차단된 칭호 클릭 시 저장 없이 설명만 표시
  const [previewTtlId, setPreviewTtlId] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // 시트 재오픈 시 선택 상태를 현재 저장값으로 리셋
  useEffect(() => {
    if (open) {
      setSelectedTtlId(currentPrimaryTtlId);
      setSelectedBadge(currentBadgeEffect);
      setSelectedFrame(currentFrameCd);
      setPreviewTtlId(null);
    }
  }, [open, currentPrimaryTtlId, currentBadgeEffect, currentFrameCd]);

  // 뱃지 미리보기는 저장될 selectedTtlId 기준
  const selectedTitle = allTitles.find((t) => t.ttl_id === selectedTtlId);
  const previewName = selectedTitle?.ttl_nm ?? "GIGANG";
  // 설명 라인은 previewTtlId 우선, 없으면 selectedTtlId
  const descTitle = allTitles.find((t) => t.ttl_id === (previewTtlId ?? selectedTtlId));

  // 데이터 로드
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      // 전체 칭호 목록
      supabase
        .from("ttl_mst")
        .select("ttl_id, ttl_nm, ttl_desc, rarity_level, ttl_ctgr_cd, ttl_group_cd")
        .eq("team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false)
        .eq("use_yn", true)
        .order("ttl_ctgr_cd")
        .order("ttl_group_cd", { nullsFirst: false })
        .order("sort_ord"),
      // 내가 보유한 칭호 id 목록
      supabase
        .from("mem_ttl_rel")
        .select("ttl_id")
        .eq("team_mem_id", teamMemId)
        .eq("vers", 0)
        .eq("del_yn", false),
      // 이펙트 목록 (use_yn=false도 포함 — 표시하되 선택 불가)
      supabase
        .from("effect_mst")
        .select("effect_cd, effect_nm, effect_type, rarity_level, use_yn")
        .order("rarity_level").order("sort_ord"),
    ]).then(([titlesRes, ownedRes, effectsRes]) => {
      setAllTitles((titlesRes.data ?? []) as unknown as AllTitle[]);
      setOwnedTitleIds(new Set((ownedRes.data ?? []).map((r) => r.ttl_id)));
      setAllEffects((effectsRes.data ?? []) as EffectRow[]);
    }).catch((e) => {
      console.error("[CollectionSheet] 데이터 로드 실패", e);
    }).finally(() => {
      setLoading(false);
    });
  }, [open, teamMemId, teamId]);

  // 칭호 분리
  const regularTitles = allTitles.filter((t) => t.ttl_ctgr_cd !== "event");
  const eventTitles = allTitles.filter((t) => t.ttl_ctgr_cd === "event");

  // 그룹별 보유 최고 rarity — 같은 ttl_group_cd 내 최고 rarity만 선택 가능
  // ttl_group_cd가 NULL이면 독립 선택 (기강킹, 수여 칭호 등)
  const maxRarityByGroup = new Map<number, number>();
  for (const t of allTitles) {
    if (!ownedTitleIds.has(t.ttl_id) || t.ttl_group_cd === null) continue;
    const cur = maxRarityByGroup.get(t.ttl_group_cd) ?? 0;
    if (t.rarity_level > cur) maxRarityByGroup.set(t.ttl_group_cd, t.rarity_level);
  }

  // 같은 그룹에 더 높은 rarity 칭호를 보유 중이면 선택 불가 (도감에는 표시)
  // ttl_group_cd가 NULL이면 항상 독립 선택 가능
  const isBlockedByHigher = (t: AllTitle) => {
    if (t.ttl_group_cd === null) return false;
    return t.rarity_level < (maxRarityByGroup.get(t.ttl_group_cd) ?? 0);
  };

  // 선택 가능한 이펙트: 등급 해금 + use_yn=true
  const unlockedBadges = allEffects.filter((e) => e.effect_type === "badge" && e.rarity_level <= maxRarityLevel && e.use_yn);
  const unlockedFrames = allEffects.filter((e) => e.effect_type === "frame" && e.rarity_level <= maxRarityLevel && e.use_yn);
  // 선택 불가: 등급 미달 또는 use_yn=false (표시는 함)
  const lockedBadges = allEffects.filter((e) => e.effect_type === "badge" && (e.rarity_level > maxRarityLevel || !e.use_yn));
  const lockedFrames = allEffects.filter((e) => e.effect_type === "frame" && (e.rarity_level > maxRarityLevel || !e.use_yn));

  const handleSave = () => {
    startTransition(async () => {
      if (selectedTtlId !== currentPrimaryTtlId) {
        const r = await setPrimaryTitle(selectedTtlId);
        if (r && !r.ok) return;
      }
      if (selectedBadge !== currentBadgeEffect || selectedFrame !== currentFrameCd) {
        const r = await setSelectedEffect(selectedBadge, selectedFrame);
        if (r && !r.ok) return;
      }
      onClose();
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[99] bg-black/50" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-[100] flex h-[70dvh] flex-col rounded-t-2xl bg-background">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-base font-bold text-foreground">내 컬렉션</h2>
          <button onClick={onClose} aria-label="닫기" className="text-muted-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* 탭 + 저장 */}
        <div className="flex items-center border-b border-border px-6">
          <div className="flex flex-1">
            {([
              { key: "title", label: "칭호" },
              { key: "badge", label: "이펙트" },
              { key: "frame", label: "프레임" },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "mr-4 pb-3 text-sm font-medium transition-colors",
                  tab === key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="mb-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
        </div>

        {/* 고정 미리보기 영역 */}
        {!loading && (
          <div className="shrink-0 border-b border-border px-6 py-3">
            <div className={cn(
              "flex items-center gap-3 rounded-2xl border bg-card p-3 transition-all",
              selectedFrame ? (FRAME_CSS[selectedFrame] ?? "border-border") : "border-border"
            )}>
              <div className="size-8 shrink-0 rounded-full bg-secondary" />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-sm font-bold text-foreground">{memberName}</span>
                {selectedTitle && (
                  <BadgePreview effectCd={selectedBadge ?? "none"} name={selectedTitle.ttl_nm} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : (
            <>
              {/* ── 칭호 탭 ── */}
              {tab === "title" && (
                <div className="flex flex-col gap-5">
                  {/* 일반 칭호 */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">일반</span>
                      <span className="text-[11px] text-muted-foreground">
                        획득 {regularTitles.filter((t) => ownedTitleIds.has(t.ttl_id)).length} / {regularTitles.length}
                      </span>
                    </div>
                    {descTitle?.ttl_desc && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {descTitle.ttl_desc}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {regularTitles.map((t) => {
                        const owned = ownedTitleIds.has(t.ttl_id);
                        const blocked = owned && isBlockedByHigher(t);
                        const selectable = owned && !blocked;
                        const isSelected = selectedTtlId === t.ttl_id;
                        const isPreviewing = previewTtlId === t.ttl_id;
                        return (
                          <button
                            key={t.ttl_id}
                            disabled={!owned}
                            onClick={() => {
                              if (selectable) {
                                setSelectedTtlId(isSelected ? null : t.ttl_id);
                                setPreviewTtlId(null);
                              } else if (blocked) {
                                setPreviewTtlId(isPreviewing ? null : t.ttl_id);
                              }
                            }}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                              // 선택됨 (저장 대상)
                              selectable && isSelected && "border-primary bg-primary/10 text-primary",
                              // 선택 가능, 미선택
                              selectable && !isSelected && "border-border bg-secondary text-foreground",
                              // 보유 + 차단 + 설명보기 중 (파란 테두리 살짝)
                              blocked && isPreviewing && "border-primary/40 bg-muted text-muted-foreground opacity-65",
                              // 보유 + 차단 (흐림)
                              blocked && !isPreviewing && "border-border bg-muted text-muted-foreground opacity-50",
                              // 미보유 마스킹
                              !owned && "border-dashed border-border/50 bg-muted/50 text-muted-foreground/40 cursor-default select-none",
                            )}
                          >
                            {owned ? (
                              <>
                                {t.ttl_nm}
                                {isSelected && <Check className="size-3" />}
                              </>
                            ) : (
                              <>
                                <Lock className="size-2.5 shrink-0" />
                                <span className="blur-[2px]">{t.ttl_nm}</span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Event 칭호 — 보유한 것만 표시 (가리지 않음) */}
                  {eventTitles.filter((t) => ownedTitleIds.has(t.ttl_id)).length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">Event</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {eventTitles
                          .filter((t) => ownedTitleIds.has(t.ttl_id))
                          .map((t) => {
                            const isSelected = selectedTtlId === t.ttl_id;
                            return (
                              <button
                                key={t.ttl_id}
                                onClick={() => setSelectedTtlId(isSelected ? null : t.ttl_id)}
                                className={cn(
                                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                                  isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-foreground",
                                )}
                              >
                                {t.ttl_nm}
                                {isSelected && <Check className="size-3" />}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ── 이펙트 탭 ── */}
              {tab === "badge" && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                      해금 ({unlockedBadges.length}종)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {unlockedBadges.map((e) => {
                        const isSelected = selectedBadge === e.effect_cd;
                        return (
                          <button
                            key={e.effect_cd}
                            onClick={() => setSelectedBadge(isSelected ? null : e.effect_cd)}
                            className={cn(
                              "flex items-center gap-1 rounded-full border transition-all",
                              isSelected ? "border-primary bg-primary/10 pr-1.5" : "border-transparent"
                            )}
                          >
                            <BadgePreview effectCd={e.effect_cd} name={previewName} />
                            {isSelected && <Check className="size-3 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {lockedBadges.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                        잠김 ({lockedBadges.length}종)
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {lockedBadges.map((e) => (
                          <span key={e.effect_cd} className="cursor-default opacity-40">
                            <BadgePreview effectCd={e.effect_cd} name={previewName} />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── 프레임 탭 ── */}
              {tab === "frame" && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                      해금 ({unlockedFrames.length}종)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {unlockedFrames.map((e) => {
                        const isSelected = selectedFrame === e.effect_cd;
                        const frameCls = FRAME_CSS[e.effect_cd] ?? "";
                        return (
                          <button
                            key={e.effect_cd}
                            onClick={() => setSelectedFrame(isSelected ? null : e.effect_cd)}
                            className={cn(
                              "relative flex h-16 items-center justify-center rounded-2xl border bg-card transition-all",
                              frameCls || "border-border",
                              isSelected && "ring-2 ring-primary ring-offset-1"
                            )}
                          >
                            {isSelected && (
                              <span className="flex size-5 items-center justify-center rounded-full bg-primary">
                                <Check className="size-3 text-primary-foreground" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {lockedFrames.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                        잠김 ({lockedFrames.length}종)
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {lockedFrames.map((e) => {
                          const frameCls = FRAME_CSS[e.effect_cd] ?? "";
                          return (
                            <div
                              key={e.effect_cd}
                              className={cn(
                                "flex h-16 items-center justify-center rounded-2xl border bg-card opacity-40",
                                frameCls || "border-border"
                              )}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
