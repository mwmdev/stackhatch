"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

const TOUR = "/video/stackhatch-tour";

/**
 * The narrated two-minute tour. It shows its poster until someone asks for it, then plays with
 * sound, native controls and English captions; it never autoplays.
 */
export default function HeroTour() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  // The Play button unmounts on start; hand focus to the native controls, not the page body.
  useEffect(() => {
    if (started) videoRef.current?.focus();
  }, [started]);

  const start = () => {
    setStarted(true);
    // A refused play() (no supported source, data saver) leaves the native controls to retry.
    videoRef.current?.play().catch(() => {});
  };

  return (
    <div className={styles.player}>
      <video
        ref={videoRef}
        className={styles.video}
        poster={`${TOUR}-poster.webp`}
        preload="none"
        playsInline
        controls={started}
        aria-label="StackHatch in two minutes"
        onClick={started ? undefined : start}
      >
        <source src={`${TOUR}-720.mp4`} type="video/mp4" media="(max-width: 760px)" />
        <source src={`${TOUR}.mp4`} type="video/mp4" />
        <track kind="captions" src={`${TOUR}.en.vtt`} srcLang="en" label="English" />
      </video>
      {started ? null : (
        <button type="button" className={`btn btn--primary btn--lg ${styles.play}`} onClick={start}>
          <Play aria-hidden="true" />
          Watch the tour <span className={styles.runtime}>2 min</span>
        </button>
      )}
    </div>
  );
}
