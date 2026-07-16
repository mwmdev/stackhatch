import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UseCaseCarousel, { type UseCase } from "./UseCaseCarousel";

const CASES: readonly UseCase[] = [
  {
    title: "Trace unfamiliar code",
    description: "See how a repository fits together before making a change.",
    image: "/screenshots/architecture-overview.webp",
    imageAlt: "Architecture map showing connected codebase components",
  },
  {
    title: "Compare architecture options",
    description: "Ask questions and weigh alternatives in the context of the system.",
    image: "/screenshots/ask-and-compare.webp",
    imageAlt: "StackHatch chat comparing architecture options",
  },
  {
    title: "Keep decisions current",
    description: "Place Note nodes on the map, rescan the repository, and revisit decisions.",
    image: "/screenshots/note-node-and-rescan.webp",
    imageAlt: "Architecture map with a Note node beside repository rescan controls",
  },
];

describe("UseCaseCarousel", () => {
  it("shows the first use case and exposes carousel semantics", () => {
    render(<UseCaseCarousel cases={CASES} />);

    const carousel = screen.getByRole("region", { name: "StackHatch use cases" });
    expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
    expect(screen.getByRole("heading", { name: "Trace unfamiliar code" })).toBeInTheDocument();
    expect(screen.getByText(CASES[0].description)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing use case 1 of 3: Trace unfamiliar code"
    );
  });

  it("moves next and previous with wraparound", () => {
    render(<UseCaseCarousel cases={CASES} />);

    fireEvent.click(screen.getByRole("button", { name: "Previous use case" }));
    expect(screen.getByRole("heading", { name: "Keep decisions current" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next use case" }));
    expect(screen.getByRole("heading", { name: "Trace unfamiliar code" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next use case" }));
    expect(
      screen.getByRole("heading", { name: "Compare architecture options" })
    ).toBeInTheDocument();
  });

  it("supports ArrowLeft and ArrowRight keyboard navigation", () => {
    render(<UseCaseCarousel cases={CASES} />);
    const carousel = screen.getByRole("region", { name: "StackHatch use cases" });

    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    expect(
      screen.getByRole("heading", { name: "Compare architecture options" })
    ).toBeInTheDocument();

    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: "Trace unfamiliar code" })).toBeInTheDocument();
  });
});
