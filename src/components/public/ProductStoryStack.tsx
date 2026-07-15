"use client";

import { useId, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "../../app/landing.module.css";

const canUseScrollTrigger =
  typeof window !== "undefined" && typeof window.matchMedia === "function";

if (canUseScrollTrigger) {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

export interface ProductStory {
  title: string;
  description: string;
  desktop: string;
  mobile: string;
  alt: string;
}

interface ProductStoryStackProps {
  stories: readonly ProductStory[];
}

export default function ProductStoryStack({ stories }: ProductStoryStackProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const stackId = useId();

  useGSAP(
    () => {
      const stack = stackRef.current;
      if (!stack || !canUseScrollTrigger) return;

      const media = gsap.matchMedia();

      media.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const cards = Array.from(stack.querySelectorAll<HTMLElement>(`.${styles.storyCard}`));

        cards.forEach((card, index) => {
          const image = card.querySelector<HTMLImageElement>(`.${styles.storyImage}`);
          if (!image) return;

          const entry = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: card,
              start: index === 0 ? "top 88%" : "top 92%",
              end: index === 0 ? "top 32%" : "top 18%",
              scrub: true,
              invalidateOnRefresh: true,
            },
          });

          if (index > 0) {
            entry.fromTo(card, { yPercent: 24 }, { yPercent: 0 }, 0);
          }

          entry.fromTo(image, { scale: 0.8, transformOrigin: "50% 50%" }, { scale: 1 }, 0);

          const previousImage = cards[index - 1]?.querySelector<HTMLImageElement>(
            `.${styles.storyImage}`
          );

          if (previousImage) {
            gsap.fromTo(
              previousImage,
              { autoAlpha: 1, filter: "brightness(1)" },
              {
                autoAlpha: 0.2,
                filter: "brightness(0.45)",
                ease: "none",
                scrollTrigger: {
                  trigger: card,
                  start: "top 82%",
                  end: "top 22%",
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              }
            );
          }
        });
      });

      return () => media.revert();
    },
    { dependencies: [stories], scope: stackRef }
  );

  return (
    <div ref={stackRef} className={styles.storyStack}>
      {stories.map((story, index) => {
        const headingId = `${stackId}-story-${index}`;

        return (
          <article className={styles.storyCard} aria-labelledby={headingId} key={story.title}>
            <div className={styles.storyCopy}>
              <span className={styles.storyIndex} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 id={headingId}>{story.title}</h3>
              <p>{story.description}</p>
            </div>

            <picture className={styles.storyMedia}>
              <source media="(max-width: 767px)" srcSet={story.mobile} />
              <img
                className={styles.storyImage}
                src={story.desktop}
                alt={story.alt}
                width={1600}
                height={1000}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </article>
        );
      })}
    </div>
  );
}
