"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Burst } from "@/components/intro/burst";
import { CrewFrame } from "@/components/intro/crew-frame";
import { useIntroDone } from "@/components/intro/intro";
import { RollLetters } from "@/components/intro/roll-text";
import { useFitSize } from "@/components/intro/use-fit-size";
import { crewFrames } from "@/lib/intro/data";

/** NO opens every line. Only what follows it changes. */
const TAILS = [
  "GIVE UP",
  "PAIN NO GAIN",
  "EXCUSES",
  "SHORTCUTS",
  "ONE RUNS ALONE",
];
const FINAL_TAIL = "TIME TO BE WEAK";
const SEQUENCE = [...TAILS, FINAL_TAIL];
const ALL = SEQUENCE.map((tail) => `NO ${tail}`);

/** Long enough to look at the photograph, not just read the line. The roll
 *  itself stays quick — it is the dwell that matters. */
const HOLD_MS = 2000;
/** The last line arrives at the top like the others, then walks to the
 *  middle of the screen before the crew comes for it. */
const CENTER_AFTER_MS = 600;
const BEFORE_BURST_MS = 2200;

const LINE = "headline caps whitespace-nowrap";

export function Hero() {
  const reduced = useReducedMotion();
  const introDone = useIntroDone();
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const { size: fitted, measureAt } = useFitSize(box, ruler, ALL, { max: 150 });
  /** The rendered line reserves the longest tail plus the NO, so it runs a
   *  hair wider than the ruler. Back off so nothing touches the edge. */
  const size = fitted * 0.92;
  const [step, setStep] = useState(() => (reduced ? SEQUENCE.length - 1 : -1));
  const [centered, setCentered] = useState(() => Boolean(reduced));
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (!introDone || reduced) return;

    const timers = SEQUENCE.map((_, i) =>
      window.setTimeout(() => setStep(i), 260 + i * HOLD_MS),
    );
    const lastAt = 260 + (SEQUENCE.length - 1) * HOLD_MS;
    const center = window.setTimeout(
      () => setCentered(true),
      lastAt + CENTER_AFTER_MS,
    );
    const crew = window.setTimeout(
      () => setBurst(true),
      lastAt + BEFORE_BURST_MS,
    );
    return () => [...timers, center, crew].forEach(window.clearTimeout);
  }, [introDone, reduced]);

  const tail = step >= 0 ? SEQUENCE[step] : null;
  /** The last line does not roll in. The photograph leaves, the screen is
   *  paper, and the line is simply there — the stop the five before it were
   *  building toward. */
  const last = step === SEQUENCE.length - 1;
  const shown = Math.max(step, 0);
  const frame = crewFrames[shown];
  const tone = frame.tone === "dark" ? "text-intro-paper" : "text-intro-ink";

  return (
    <section className="relative flex h-svh flex-col items-center justify-center overflow-hidden">
      {/* Off-screen rulers: one size that fits the longest line. */}
      <div
        ref={ruler}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 opacity-0"
      >
        {ALL.map((text) => (
          <div key={text} className={LINE} style={{ fontSize: measureAt }}>
            {text}
          </div>
        ))}
      </div>

      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: introDone ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      >
        <CrewFrame
          src={frame.src}
          tone={frame.tone}
          focus={frame.focus}
          stepKey={shown}
          alt={`기강 — NO ${SEQUENCE[shown]}`}
        />
      </motion.div>


      {/* The page heading, and the box the line is measured against. It has
          the same side padding as the line layer, so the fit is honest. It is
          transparent rather than hidden so a screen reader still gets it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 px-6 opacity-0 md:px-10">
        <div ref={box} className="w-full">
          <h1 className={LINE} style={{ fontSize: size }}>
            NO {FINAL_TAIL}
          </h1>
        </div>
      </div>

      {/* Every line stands at the top. The outgoing one rolls out, the
          incoming one rolls in, and the NO holds still between them. The last
          line then leaves the top and walks to the middle of the screen. */}
      <AnimatePresence initial={false}>
        {tail && (
          <motion.div
            key={step}
            aria-hidden
            className={`absolute inset-0 flex px-6 md:px-10 ${
              last && centered ? "items-center" : "items-start pt-[14svh]"
            }`}
            initial="out"
            animate="in"
            exit="gone"
          >
            <motion.p
              layout="position"
              className={`${LINE} ${tone} w-full`}
              style={{ fontSize: size, transformOrigin: "50% 50%" }}
              // The page opened by pulling the mark through the screen. It
              // closes the same way: the last line is pulled through, and
              // the crew is what was behind it.
              animate={
                burst && last && !reduced
                  ? {
                      scale: 14,
                      opacity: 0,
                      transition: { duration: 1.1, ease: [0.7, 0, 0.84, 0] },
                    }
                  : { scale: 1, opacity: 1 }
              }
              transition={{
                layout: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
              }}
            >
              <motion.span
                className="inline-block"
                variants={{
                  out: { opacity: 1 },
                  in: { opacity: 1 },
                  gone: { opacity: 0, transition: { duration: 0 } },
                }}
              >
                NO
              </motion.span>
              {" "}
              <span className="relative inline-block align-baseline">
                {/* Holds the width of the longest tail so NO never shifts. */}
                <span className="invisible">{FINAL_TAIL}</span>
                <span className="absolute left-0 top-0 whitespace-nowrap">
                  <RollLetters text={tail} still={last} />
                </span>
              </span>
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <Burst play={burst} />
    </section>
  );
}
