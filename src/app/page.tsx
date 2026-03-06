"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MOCK_NODES = [
  { name: "React Frontend", tech: "Next.js", color: "var(--color-client)" },
  { name: "API Gateway", tech: "Express", color: "var(--color-api)" },
  { name: "Auth Service", tech: "Auth0", color: "var(--color-services)" },
  { name: "PostgreSQL", tech: "Neon", color: "var(--color-data)" },
  { name: "Redis Cache", tech: "Upstash", color: "var(--color-data)" },
  { name: "Object Store", tech: "AWS S3", color: "var(--color-infrastructure)" },
];

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: "Reverse-engineer any repo",
    description: "Drop in a public GitHub URL. AI scans the codebase and maps every component, service, and connection into an interactive diagram.",
    color: "var(--color-client)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "AI architecture assistant",
    description: "Chat with an assistant that understands your requirements. Describe what you need, and watch the diagram build itself in real-time.",
    color: "var(--color-services)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
    title: "Smart alternatives",
    description: "Click any node to explore alternatives. AI suggests better technologies with reasoning — swap PostgreSQL for MongoDB, Express for Fastify.",
    color: "var(--color-api)",
  },
];

const STEPS = [
  { num: "1", title: "Choose your starting point", description: "Paste a GitHub URL, upload a PRD, or start with a blank canvas." },
  { num: "2", title: "AI generates architecture", description: "Claude analyzes your input and creates a visual diagram with components and connections." },
  { num: "3", title: "Explore and iterate", description: "Edit nodes, compare alternatives, and refine your design through conversation." },
];

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  async function createProject(opts?: { repoUrl?: string; description?: string }) {
    setCreating(true);
    setError("");
    try {
      let name = "Untitled Project";
      if (opts?.repoUrl) {
        const match = opts.repoUrl.match(/github\.com\/[^/]+\/([^/]+)/);
        name = match ? match[1].replace(/\.git$/, "") : "Imported Project";
      } else if (opts?.description) {
        const firstLine = opts.description.split("\n").find((l) => l.trim());
        if (firstLine) {
          name = firstLine.replace(/^#\s*/, "").trim().slice(0, 80) || name;
        }
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          repoUrl: opts?.repoUrl || undefined,
          description: opts?.description || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create project");
        return;
      }
      const project = await res.json();
      router.push(`/project/${project.id}`);
    } catch {
      setError("Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  function handleRepoSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = repoUrl.trim();
    if (!url) return;
    createProject({ repoUrl: url });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      createProject({ description: text });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Navbar */}
      <nav className="nav-blur sticky top-0 z-40 border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="text-lg font-bold tracking-tight">StackHatch</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link
              href="/admin"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Admin"
              aria-label="Admin"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </Link>
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Settings"
              aria-label="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <UserAvatar />
          </div>
        </div>
      </nav>

      <main>
        {/* ===== HERO ===== */}
        <section className="relative overflow-hidden">
          <div className="hero-grid absolute inset-0" aria-hidden="true" />
          <div className="hero-glow-lg absolute inset-0" aria-hidden="true" />

          <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-20 text-center sm:pt-28">
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tighter sm:text-5xl lg:text-6xl">
              Understand any codebase.
              <br />
              <span className="gradient-text">Visualize its architecture.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
              Paste a GitHub repo, upload requirements, or describe your idea.
              AI generates interactive architecture diagrams in seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => scrollTo("get-started")}
                className="rounded-full bg-[var(--color-client)] px-7 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ boxShadow: "0 4px 24px -4px color-mix(in srgb, var(--color-client) 40%, transparent)" }}
              >
                Get started
              </button>
              <button
                onClick={() => scrollTo("how-it-works")}
                className="rounded-full border border-[var(--border)] px-7 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
              >
                How it works
              </button>
            </div>
            <p className="mt-4 text-xs text-[var(--muted-foreground)] opacity-60">
              Powered by Claude &middot; Bring your own API key
            </p>
          </div>
        </section>

        {/* ===== PRODUCT PREVIEW ===== */}
        <section className="relative px-6 pb-20 pt-4">
          <div className="mx-auto max-w-4xl">
            <div className="product-frame animate-float overflow-hidden rounded-xl">
              {/* Window bar */}
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
                <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
                <span className="h-3 w-3 rounded-full bg-[#28C840]" />
                <span className="ml-3 text-xs text-[var(--muted-foreground)]">
                  StackHatch — my-saas-app
                </span>
              </div>
              {/* Content: chat + canvas */}
              <div className="flex min-h-[240px] sm:min-h-[300px]">
                {/* Mini chat sidebar */}
                <div className="hidden w-[28%] flex-shrink-0 flex-col border-r border-[var(--border)] md:flex">
                  <div className="border-b border-[var(--border)] px-3 py-2">
                    <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">
                      Architecture Assistant
                    </span>
                  </div>
                  <div className="flex-1 space-y-2.5 p-3">
                    <div className="ml-auto max-w-[90%] rounded-lg bg-[var(--color-client)] px-2.5 py-1.5 text-[10px] leading-snug text-white">
                      Analyze my e-commerce app
                    </div>
                    <div className="max-w-[90%] rounded-lg bg-[var(--muted)] px-2.5 py-1.5 text-[10px] leading-snug text-[var(--foreground)]">
                      I&apos;ve identified 6 core components in your architecture...
                    </div>
                  </div>
                  <div className="border-t border-[var(--border)] p-2">
                    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[9px] text-[var(--muted-foreground)]">
                      Describe your application...
                    </div>
                  </div>
                </div>
                {/* Mini canvas */}
                <div className="relative flex flex-1 items-center justify-center p-4 sm:p-8">
                  {/* Subtle connection lines */}
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                    <line x1="17%" y1="46%" x2="50%" y2="46%" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="50%" y1="46%" x2="83%" y2="46%" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="17%" y1="46%" x2="17%" y2="68%" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="50%" y1="46%" x2="50%" y2="68%" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="83%" y1="46%" x2="83%" y2="68%" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
                  </svg>
                  <div className="relative grid w-full max-w-md grid-cols-3 gap-3 sm:gap-4">
                    {MOCK_NODES.map((node) => (
                      <div
                        key={node.name}
                        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-2"
                        style={{ borderLeft: `3px solid ${node.color}` }}
                      >
                        <div className="text-[10px] font-medium text-[var(--card-foreground)] sm:text-xs">
                          {node.name}
                        </div>
                        <div className="text-[9px] text-[var(--muted-foreground)] sm:text-[10px]">
                          {node.tech}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== GET STARTED ===== */}
        <section id="get-started" className="border-t border-[var(--border)] py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-10 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-client)]">
                Get started
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Three ways to begin
              </h2>
            </div>

            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
              {/* Analyze Repo */}
              <div className="entry-card animate-fade-in-up flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-client)]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-client) 12%, transparent)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                </div>
                <h3 className="font-semibold text-[var(--card-foreground)]">
                  Analyze a Repository
                </h3>
                <p className="mt-1 flex-1 text-sm text-[var(--muted-foreground)]">
                  Reverse-engineer architecture from a public GitHub repo
                </p>
                <form onSubmit={handleRepoSubmit} className="mt-4 space-y-2">
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    disabled={creating}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={creating || !repoUrl.trim()}
                    className="w-full rounded-lg bg-[var(--color-client)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Analyze"}
                  </button>
                </form>
              </div>

              {/* Upload PRD */}
              <div
                className="entry-card animate-fade-in-up flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
                style={{ animationDelay: "80ms" }}
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-services)]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-services) 12%, transparent)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <h3 className="font-semibold text-[var(--card-foreground)]">
                  Upload a PRD
                </h3>
                <p className="mt-1 flex-1 text-sm text-[var(--muted-foreground)]">
                  Generate architecture from your requirements document
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={creating}
                    className="w-full rounded-lg border border-dashed border-[var(--border)] py-2 text-sm font-medium text-[var(--foreground)] hover:border-[var(--color-services)] hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    Choose file...
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <p className="mt-1.5 text-center text-xs text-[var(--muted-foreground)]">
                    .md, .txt, .pdf, .docx
                  </p>
                </div>
              </div>

              {/* Start from Scratch */}
              <div
                className="entry-card animate-fade-in-up flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
                style={{ animationDelay: "160ms" }}
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-api)]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-api) 12%, transparent)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
                <h3 className="font-semibold text-[var(--card-foreground)]">
                  Start Fresh
                </h3>
                <p className="mt-1 flex-1 text-sm text-[var(--muted-foreground)]">
                  Begin with a blank canvas and let AI guide your design
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => createProject()}
                    disabled={creating}
                    className="w-full rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    Start from scratch
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-red-500">{error}</p>
            )}
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section id="features" className="border-t border-[var(--border)] py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-services)]">
                Capabilities
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Built for engineers who ship
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className="feature-card animate-fade-in-up rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div
                    className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg"
                    style={{
                      color: f.color,
                      backgroundColor: `color-mix(in srgb, ${f.color} 12%, transparent)`,
                    }}
                  >
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--card-foreground)]">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="how-it-works" className="border-t border-[var(--border)] py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-12 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-api)]">
                How it works
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                From zero to architecture in three steps
              </h2>
            </div>

            <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
              {/* Connecting line (desktop only) */}
              <div
                className="absolute left-[17%] right-[17%] top-[28px] hidden h-px md:block"
                style={{ background: "linear-gradient(90deg, var(--color-client), var(--color-services), var(--color-api))", opacity: 0.3 }}
                aria-hidden="true"
              />

              {STEPS.map((step, i) => (
                <div key={step.num} className="relative text-center">
                  <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 text-xl font-bold"
                    style={{
                      borderColor: [
                        "var(--color-client)",
                        "var(--color-services)",
                        "var(--color-api)",
                      ][i],
                      color: [
                        "var(--color-client)",
                        "var(--color-services)",
                        "var(--color-api)",
                      ][i],
                      backgroundColor: "var(--background)",
                    }}
                  >
                    {step.num}
                  </div>
                  <h3 className="font-semibold text-[var(--foreground)]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== RECENT PROJECTS ===== */}
        {loading ? (
          <section className="border-t border-[var(--border)]">
            <div className="mx-auto max-w-5xl px-6 py-10">
              <div className="py-8 text-center text-[var(--muted-foreground)]">
                Loading projects...
              </div>
            </div>
          </section>
        ) : projects.length > 0 && (
          <section className="border-t border-[var(--border)] py-16">
            <div className="mx-auto max-w-5xl px-6">
              <h2 className="mb-6 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                Recent projects
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-all duration-200 hover:shadow-md"
                  >
                    <button
                      onClick={() => router.push(`/project/${project.id}`)}
                      className="block w-full text-left"
                      data-testid={`project-card-${project.id}`}
                    >
                      <h3 className="font-medium text-[var(--card-foreground)]">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                          {project.description}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                        Updated {formatDate(project.updatedAt)}
                      </p>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(project);
                      }}
                      className="absolute right-3 top-3 hidden h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-red-100 hover:text-red-600 group-hover:flex dark:hover:bg-red-900/30"
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ===== FINAL CTA ===== */}
        <section className="relative overflow-hidden border-t border-[var(--border)] py-24">
          <div className="hero-glow-lg absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto max-w-2xl px-6 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to map your architecture?
            </h2>
            <p className="mt-4 text-[var(--muted-foreground)]">
              Stop drawing boxes by hand. Let AI do the heavy lifting.
            </p>
            <button
              onClick={() => scrollTo("get-started")}
              className="mt-8 rounded-full bg-[var(--color-client)] px-8 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ boxShadow: "0 4px 24px -4px color-mix(in srgb, var(--color-client) 40%, transparent)" }}
            >
              Get started free
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <span className="text-sm text-[var(--muted-foreground)]">
            StackHatch &middot; Built with Next.js &amp; Claude
          </span>
          <div className="flex items-center gap-6 text-sm text-[var(--muted-foreground)]">
            <Link href="/settings" className="hover:text-[var(--foreground)]">Settings</Link>
            <Link href="/admin" className="hover:text-[var(--foreground)]">Admin</Link>
          </div>
        </div>
      </footer>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !deleting && setDeleteTarget(null)}
          data-testid="delete-modal"
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl bg-[var(--card)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--card-foreground)]">
              Delete Project
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                data-testid="confirm-delete"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
