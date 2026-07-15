"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Image from "next/image";
import styles from "../../app/landing.module.css";

export interface UseCase {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}

interface UseCaseCarouselProps {
  cases: readonly UseCase[];
}

export default function UseCaseCarousel({ cases }: UseCaseCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (cases.length === 0) return null;

  const safeIndex = activeIndex % cases.length;
  const activeCase = cases[safeIndex];

  function showPrevious() {
    setActiveIndex((current) => (current - 1 + cases.length) % cases.length);
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % cases.length);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      showNext();
    }
  }

  return (
    <section
      className={styles.useCaseCarousel}
      role="region"
      aria-roledescription="carousel"
      aria-label="StackHatch use cases"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.useCaseStage}>
        <Image
          key={activeCase.image}
          src={activeCase.image}
          alt={activeCase.imageAlt}
          width="1600"
          height="1000"
          loading="lazy"
          decoding="async"
        />
        <div className={styles.useCaseCopy}>
          <h3 className={styles.useCaseTitle}>{activeCase.title}</h3>
          <p className={styles.useCaseDescription}>{activeCase.description}</p>
        </div>
      </div>

      <div className={styles.useCaseThumbs} aria-label="Choose a use case">
        {cases.map((useCase, index) => (
          <button
            key={useCase.title}
            type="button"
            className={`${styles.useCaseThumb} ${
              index === safeIndex ? styles.useCaseThumbActive : ""
            }`}
            aria-label={`Show use case: ${useCase.title}`}
            aria-current={index === safeIndex ? "true" : undefined}
            onClick={() => setActiveIndex(index)}
          >
            <Image
              src={useCase.image}
              alt=""
              width="320"
              height="200"
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>

      <div className={styles.useCaseControls}>
        <button
          type="button"
          className={styles.useCaseButton}
          aria-label="Previous use case"
          onClick={showPrevious}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.useCaseButton}
          aria-label="Next use case"
          onClick={showNext}
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        Showing use case {safeIndex + 1} of {cases.length}: {activeCase.title}
      </p>
    </section>
  );
}
