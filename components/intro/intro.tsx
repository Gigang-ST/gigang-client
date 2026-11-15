"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { BURST_FRAMES, LOGO_MARK, planIntroMedia } from "@/lib/intro/media";

type IntroState = {
  done: boolean;
  /** Burst frames in play order (fixed at build time). */
  frames: readonly string[];
  /** Photos fetched so far. The burst skips frames not in here yet. */
  ready: ReadonlySet<string>;
  /** Let go of photos the page has finished with (see `retained`). */
  release: (srcs?: readonly string[]) => void;
};

const IntroContext = createContext<IntroState>({
  done: false,
  frames: [],
  ready: new Set(),
  release: () => {},
});

/** True once the door has opened and the page underneath may start moving. */
export function useIntroDone() {
  return useContext(IntroContext).done;
}

/** Burst frames, what has arrived, and a way to release them once used. */
export function useIntroMedia() {
  const { frames, ready, release } = useContext(IntroContext);
  return { frames, ready, release };
}

const MINIMUM_HOLD = 900;
/** Never hold the door shut longer than this, however slow the network is. */
const PATIENCE = 9000;
/** Background fetches at once — few enough that the next frame in play order
 *  is not starved by ones far behind it. */
const DEFERRED_PARALLEL = 3;

/**
 * Each preloaded image is held until the page is done with it, so its bytes
 * stay in the memory cache and the swap in the burst is instant. It is not
 * held forever: the line photos are let go when the burst starts and the
 * burst's when it lands — the URLs are immutable-cached, so anything dropped
 * early comes back from the disk cache, not the network.
 */
const retained = new Map<string, HTMLImageElement>();

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
    retained.set(src, img);
  });
}

/**
 * The splash waits only for what the first seconds need — the line
 * backgrounds, the mark, the opening and the landing of the burst
 * (`planIntroMedia`). The rest of the burst is fetched in play order while the
 * lines run (~12s before the burst), and anything still missing when its turn
 * comes is skipped. The mark holds the screen while the critical part loads,
 * then zooms past the viewer.
 */
export function Intro({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    const { critical, deferred } = planIntroMedia(BURST_FRAMES);
    let settled = 0;

    const arrived = (src: string) => {
      if (cancelled) return;
      setReady((prev) => new Set(prev).add(src));
    };

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

    const essentials = Promise.all(
      critical.map((src) =>
        preload(src).then(() => {
          settled += 1;
          arrived(src);
          if (!cancelled) setProgress(settled / critical.length);
        }),
      ),
    );

    // Behind the show: start once the essentials are in (or patience ran out),
    // so the background never competes with what holds the door.
    const queue = [...deferred];
    const worker = async () => {
      while (!cancelled && queue.length > 0) {
        const src = queue.shift()!;
        await preload(src);
        arrived(src);
      }
    };

    Promise.race([essentials, patience]).then(() => {
      open();
      for (let k = 0; k < DEFERRED_PARALLEL; k += 1) void worker();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const release = useCallback((srcs?: readonly string[]) => {
    if (!srcs) {
      retained.clear();
      return;
    }
    for (const src of srcs) retained.delete(src);
  }, []);

  const value = useMemo(
    () => ({ done, frames: BURST_FRAMES, ready, release }),
    [done, ready, release],
  );

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
    <IntroContext.Provider value={value}>
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
                src={LOGO_MARK}
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
                  src={LOGO_MARK}
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
