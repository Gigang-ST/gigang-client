"use client";

import { motion, useReducedMotion } from "motion/react";

const STEP = 0.014;
const DURATION = 0.24;
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Letters that roll up into place, left to right, and roll up and out the
 * same way when their line leaves. The line itself is mounted and unmounted
 * by the parent's AnimatePresence — this only supplies the letter variants,
 * so an outgoing line rolls out wherever it was standing.
 */
export function RollLetters({
  text,
  still = false,
}: {
  text: string;
  /** Arrive without the roll: simply be there. */
  still?: boolean;
}) {
  const reduced = useReducedMotion();

  if (reduced || still) {
    return <span className="whitespace-pre">{text}</span>;
  }

  return (
    <>
      {[...text].map((letter, i) => (
        <span
          key={i}
          className="inline-block overflow-hidden align-bottom"
          style={{ lineHeight: 1 }}
        >
          <motion.span
            className="inline-block whitespace-pre"
            variants={{
              out: { y: "105%" },
              in: {
                y: "0%",
                transition: { duration: DURATION, delay: i * STEP, ease: EASE },
              },
              gone: {
                y: "-105%",
                transition: { duration: DURATION, delay: i * STEP, ease: EASE },
              },
            }}
          >
            {letter === " " ? " " : letter}
          </motion.span>
        </span>
      ))}
    </>
  );
}
