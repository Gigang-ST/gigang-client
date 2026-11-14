"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";


/**
 * The photo behind the whole screen, swapped as the line turns.
 *
 * Files arrive already graded — greyscale, with whatever colour was worth
 * keeping left in — so nothing is filtered here. A light veil sits over the
 * frame to hold the type's contrast, and that is all.
 */
export function CrewFrame({
  src,
  stepKey,
  alt,
  tone,
  focus,
}: {
  src: string | null;
  stepKey: string | number;
  alt: string;
  tone: "light" | "dark";
  /** Which part of the photograph survives the crop. A full-screen portrait
   *  cover keeps the middle of a landscape frame; this moves that window. */
  focus?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={stepKey}
          className="absolute inset-0"
          initial={{ clipPath: "inset(0 0 0 100%)" }}
          animate={{ clipPath: "inset(0 0 0 0%)" }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduced ? 0 : 0.3,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {src ? (
            <Image
              src={src}
              alt={alt}
              fill
              sizes="100vw"
              // The exact file the splash preloaded — no optimizer detour, so
              // the wipe never reveals an empty frame.
              unoptimized
              loading="eager"
              className="object-cover"
              style={{ objectPosition: focus }}
            />
          ) : (
            // Until the real frames land, the ground is simply paper.
            <div className="h-full w-full bg-intro-paper" />
          )}

        </motion.div>
      </AnimatePresence>

      {/* Just enough tint to hold the type: paper over a light frame, ink
          over a dark one. Never enough to erase the photograph. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            tone === "dark"
              ? "linear-gradient(to bottom, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0.38) 100%)"
              : "linear-gradient(to bottom, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.34) 100%)",
        }}
      />
    </div>
  );
}
