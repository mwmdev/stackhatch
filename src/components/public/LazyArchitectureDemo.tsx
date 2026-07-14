"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const ArchitectureDemo = dynamic(() => import("./ArchitectureDemo"), {
  ssr: false,
});

export default function LazyArchitectureDemo({
  mode = "embedded",
}: {
  mode?: "embedded" | "full";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldHydrate, setShouldHydrate] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldHydrate(true);
          observer.disconnect();
        }
      },
      { rootMargin: "280px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={mode === "embedded" ? "demo-embed-shell" : "demo-full-shell"}
    >
      {shouldHydrate ? (
        <ArchitectureDemo mode={mode} />
      ) : (
        <Image
          src="/demos/stackhatch-self-map-poster.png"
          width={1200}
          height={630}
          alt="Read-only StackHatch architecture map showing the interface, API, services, data, and providers."
          className="h-auto w-full"
          sizes="(max-width: 1280px) 100vw, 1280px"
          priority={mode === "full"}
        />
      )}
    </div>
  );
}
