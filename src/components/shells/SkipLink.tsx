"use client";

import type { MouseEvent } from "react";

export default function SkipLink() {
  function focusMain(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById("main");
    if (!main) return;
    event.preventDefault();
    main.focus();
  }

  return (
    <a href="#main" className="skip-link" onClick={focusMain}>
      Skip to main content
    </a>
  );
}
