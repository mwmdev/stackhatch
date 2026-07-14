import Link from "next/link";
import type { Metadata } from "next";
import ThemeToggle from "@/components/ThemeToggle";
import LazyArchitectureDemo from "@/components/public/LazyArchitectureDemo";
import TrackedSourceLink from "@/components/public/TrackedSourceLink";

export const metadata = {
  title: "StackHatch architecture map",
  description:
    "Explore the real StackHatch architecture, ask checked-in questions, and compare practical alternatives without signing in.",
  alternates: { canonical: "/demo" },
  openGraph: {
    url: "/demo",
    title: "StackHatch, mapped by StackHatch",
    description: "Explore the real StackHatch architecture without signing in.",
    images: [
      {
        url: "/demos/stackhatch-self-map-poster.png",
        width: 1200,
        height: 630,
        alt: "The StackHatch codebase shown as an architecture map",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StackHatch, mapped by StackHatch",
    description: "Explore the real StackHatch architecture without signing in.",
    images: ["/demos/stackhatch-self-map-poster.png"],
  },
} satisfies Metadata;

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="public-header">
        <div className="public-header-inner">
          <Link href="/" className="wordmark">
            StackHatch
          </Link>
          <nav aria-label="Demo navigation" className="public-nav">
            <TrackedSourceLink
              href="https://github.com/mwmdev/stackhatch"
              target="_blank"
              rel="noreferrer"
              className="hide-phone"
              location="navigation"
            >
              Source
            </TrackedSourceLink>
            <TrackedSourceLink
              href="https://github.com/mwmdev/stackhatch"
              target="_blank"
              rel="noreferrer"
              className="hide-phone"
              location="navigation"
              intent="star"
            >
              Star
            </TrackedSourceLink>
            <Link href="/login?callbackUrl=/app">Sign in</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="demo-page">
        <div className="demo-page-intro">
          <p className="public-eyebrow">Public product demo</p>
          <h1>StackHatch, mapped by StackHatch.</h1>
          <p>
            This is a real, read-only map generated from the public repository. Open a component,
            follow a connection, or see how StackHatch answers a question about itself.
          </p>
        </div>
        <LazyArchitectureDemo mode="full" />
      </main>
    </div>
  );
}
