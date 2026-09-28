"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useBurstFrames } from "@/components/intro/intro";
import { JOIN_URL } from "@/lib/intro/data";

/** Frames go by faster than you can name them. That is the crew. */
const FRAME_MS = 170;
/** The last few frames slow down so the run has a landing, not a stop. */
const TAIL = [240, 330, 450, 620, 860];

const HEADLINE =
  "headline caps block text-center text-[clamp(34px,11vw,88px)] leading-[0.95] text-intro-paper mix-blend-difference";

export function Burst({ play }: { play: boolean }) {
  const reduced = useReducedMotion();
  const BURST = useBurstFrames();
  const [i, setI] = useState(0);
  const [settled, setSettled] = useState(false);
  const last = Math.max(0, BURST.length - 1);
  const frame = reduced ? last : i;
  const landed = reduced ? play : settled;
  const [leaving, setLeaving] = useState(false);

  /** The line itself is the way out. */
  const go = () => {
    if (!landed || leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      window.location.href = JOIN_URL;
    }, 520);
  };
  useEffect(() => {
    if (!play || BURST.length === 0 || reduced) return;

    let frame = 0;
    let timer = 0;

    const advance = () => {
      frame += 1;
      if (frame >= BURST.length) {
        setSettled(true);
        return;
      }
      setI(frame);
      const remaining = BURST.length - 1 - frame;
      const delay =
        remaining < TAIL.length ? TAIL[TAIL.length - 1 - remaining] : FRAME_MS;
      timer = window.setTimeout(advance, delay);
    };

    timer = window.setTimeout(advance, FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [play, reduced, BURST.length]);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-intro-ink"
      // Not a fade. The paper is pierced where the line went through, and
      // the first frame opens out from that point.
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{
        clipPath: play ? "circle(150% at 50% 50%)" : "circle(0% at 50% 50%)",
      }}
      transition={
        reduced
          ? { duration: 0.3 }
          : { duration: 1.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {/* Only the frame on screen is in the document — with 77 of them,
          keeping every one mounted costs a live layer each. The next frame
          rides along invisibly so the swap has nothing to fetch. */}
      {BURST.length > 0 &&
        [frame, (frame + 1) % BURST.length].map((n, slot) => (
          <Image
            key={BURST[n]}
            src={BURST[n]}
            alt=""
            fill
            sizes="100vw"
            // The splash fetched these exact files. The optimizer would
            // rewrite the URL and miss that cache on every frame — one fresh
            // request per 170ms, and a blank frame while it waits.
            unoptimized
            loading="eager"
            className="object-cover"
            style={{ opacity: slot === 0 ? 1 : 0 }}
          />
        ))}

      {/* A little shade under the landing, none during the run — the type
          takes its colour from the photograph by difference. */}
      <motion.div
        className="absolute inset-0 bg-intro-ink"
        animate={{ opacity: landed ? 0.42 : 0.12 }}
        transition={{ duration: 0.6 }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 px-6 text-center">
        {/* WITH GIGANG holds the middle through the run. When the last
            frame lands, BREAK YOUR WEAKNESS opens above it, WITH GIGANG
            slides down under it, and the whole block becomes the way out —
            breathing slowly so it reads as something to press. */}
        <motion.button
          type="button"
          onClick={go}
          disabled={!landed}
          aria-label="기강 사이트로 들어가기"
          layout
          className="relative flex flex-col items-center disabled:cursor-default"
          animate={
            leaving
              ? { scale: 1.08, opacity: 0, transition: { duration: 0.45 } }
              : landed
                ? { scale: [1, 1.022, 1], opacity: 1 }
                : { scale: 1, opacity: 1 }
          }
          transition={{
            layout: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
            scale:
              landed && !leaving
                ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.45 },
            opacity: { duration: 0.45 },
          }}
        >
          {/* A halo that keeps opening behind the line until it is used. */}
          {landed && !leaving && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -inset-x-10 -inset-y-8 rounded-[50%] bg-intro-paper/10 blur-2xl"
              animate={{ opacity: [0, 0.55, 0], scale: [0.86, 1.08, 0.86] }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          <AnimatePresence>
            {landed && (
              <motion.span
                key="break"
                layout
                className={HEADLINE}
                initial={{ opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                Break your
                <br />
                weakness
              </motion.span>
            )}
          </AnimatePresence>

          <motion.span
            layout
            className={HEADLINE}
            // Rises into the opening once it is wide enough to stand in.
            initial={{ opacity: 0, y: "45%" }}
            animate={play ? { opacity: 1, y: "0%" } : {}}
            transition={{ duration: 0.55, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            With Gigang
          </motion.span>
        </motion.button>

        {/* A quiet nudge at the block above: an arrow and two words, kept
            faint so they never become the loudest thing on screen. */}
        <AnimatePresence>
          {landed && !leaving && (
            <motion.div
              key="nudge"
              className="pointer-events-none flex flex-col items-center gap-1 text-intro-paper"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, -5, 0] }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.8, delay: 0.7 },
                y: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <path
                  d="M12 21V4M12 4 L5.5 10.5M12 4 L18.5 10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="caps text-[11px] tracking-[0.28em] text-intro-paper">
                Click me
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {leaving && (
          <motion.span
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[80] bg-intro-paper"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.92, 0] }}
            transition={{ duration: 0.5, times: [0, 0.35, 1] }}
          />
        )}
      </div>
    </motion.div>
  );
}
