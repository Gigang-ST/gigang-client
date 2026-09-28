"use client";

import Image from "next/image";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { fetchBurstFrames, STATIC_MEDIA } from "@/lib/intro/media";

const IntroContext = createContext<{ done: boolean; frames: string[] }>({
  done: false,
  frames: [],
});

/** True once the door has opened and the page underneath may start moving. */
export function useIntroDone() {
  return useContext(IntroContext).done;
}

/** The burst frames the splash actually fetched, in play order. */
export function useBurstFrames() {
  return useContext(IntroContext).frames;
}

const MINIMUM_HOLD = 900;
/** Never hold the door shut longer than this, however slow the network is. */
const PATIENCE = 9000;

/** Held for the life of the page so the decoded bitmaps stay in the
 *  browser's memory cache. Drop the reference and each frame goes back to
 *  the network — which is exactly the flicker this exists to prevent. */
const retained: HTMLImageElement[] = [];

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
    retained.push(img);
  });
}

/**
 * The splash fetches every photograph the page will show before it opens, so
 * nothing pops in later — the burst in particular has to be instant. The mark
 * holds the screen while that happens, then zooms past the viewer.
 */
export function Intro({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    let settled = 0;

    const open = () => {
      if (cancelled) return;
      const waited = performance.now() - started;
      window.setTimeout(
        () => !cancelled && setLoaded(true),
        Math.max(0, MINIMUM_HOLD - waited),
      );
    };

    const patience = new Promise<void>((resolve) =>
      window.setTimeout(resolve, PATIENCE),
    );

    const everything = fetchBurstFrames().then((burst) => {
      if (!cancelled) setFrames(burst);
      const media = [...STATIC_MEDIA, ...burst];
      return Promise.all(
        media.map((src: string) =>
          preload(src).then(() => {
            settled += 1;
            if (!cancelled) setProgress(settled / media.length);
          }),
        ),
      );
    });

    Promise.race([everything, patience]).then(open);

    return () => {
      cancelled = true;
    };
  }, []);

  // The page must not scroll behind the door.
  useEffect(() => {
    if (done) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [done]);

  return (
    <IntroContext.Provider value={{ done, frames }}>
      {children}
      <AnimatePresence onExitComplete={() => setDone(true)}>
        {!loaded && (
          <motion.div
            key="intro"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-intro-paper"
            exit={
              reduced
                ? { opacity: 0, transition: { duration: 0.3 } }
                : {
                    opacity: 0,
                    transition: { duration: 0.75, ease: [0.7, 0, 0.84, 0] },
                  }
            }
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={
                reduced
                  ? { opacity: 0 }
                  : {
                      // Pulled through the screen, not faded out.
                      scale: 16,
                      opacity: 0,
                      transition: { duration: 0.8, ease: [0.7, 0, 0.84, 0] },
                    }
              }
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-[46vw] max-w-[240px]"
            >
              {/* The mark fills as the crew arrives: a ghost of it waits, and
                  the real one rises into place from the bottom. */}
              <Image
                src="/logo-mark.png"
                alt=""
                aria-hidden
                width={440}
                height={440}
                priority
                className="w-full opacity-[0.12]"
              />

              <motion.div
                className="absolute inset-0"
                animate={{ clipPath: `inset(${(1 - progress) * 100}% 0 0 0)` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <Image
                  src="/logo-mark.png"
                  alt="기강"
                  width={440}
                  height={440}
                  priority
                  className="w-full"
                />
              </motion.div>

              {/* The count sits on the mark and takes its colour from it. */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <motion.span
                  className="headline caps tnum text-[22vw] leading-none text-intro-paper mix-blend-difference sm:text-[92px]"
                  animate={{ opacity: progress >= 1 ? 0 : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {Math.round(progress * 100)}
                </motion.span>
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </IntroContext.Provider>
  );
}
