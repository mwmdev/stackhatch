"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import IconControl from "@/components/ui/IconControl";
import styles from "./landing.module.css";

/** Appears once the visitor has scrolled past the first screen. */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.backToTop}>
      <IconControl
        label="Back to top"
        variant="outline"
        tooltipPlacement="left"
        onClick={() => {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        }}
      >
        <ArrowUp size={18} />
      </IconControl>
    </div>
  );
}
