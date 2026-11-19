"use client";

import { useLayoutEffect } from "react";

/**
 * Plays each `[data-reveal]` element's entrance once, when it first comes into view. Anything on
 * screen or already scrolled past at load is left alone, and without IntersectionObserver or with
 * reduced motion nothing is ever hidden. The landing CSS keys its first frames on "pending" and
 * its animations on "shown".
 */
export default function LandingReveal() {
  useLayoutEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const waiting = [...document.querySelectorAll<HTMLElement>("[data-reveal]")].filter(
      (el) => el.getBoundingClientRect().top >= window.innerHeight
    );
    if (waiting.length === 0) return;
    // A heading waits fully clipped, and the browser counts a fully clipped target as never
    // intersecting, so a heading is watched through the block that follows it.
    const watched = new Map<Element, HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = watched.get(entry.target);
          if (!entry.isIntersecting || !el) continue;
          el.dataset.reveal = "shown";
          watched.delete(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    for (const el of waiting) {
      const trigger = el.matches("h2") ? (el.nextElementSibling ?? el) : el;
      el.dataset.reveal = "pending";
      watched.set(trigger, el);
      observer.observe(trigger);
    }
    return () => {
      observer.disconnect();
      for (const el of waiting) if (el.dataset.reveal === "pending") el.dataset.reveal = "";
    };
  }, []);
  return null;
}
