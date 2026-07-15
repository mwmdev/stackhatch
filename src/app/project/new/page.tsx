"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TemplatePicker from "@/components/templates/TemplatePicker";

interface Template {
  id: string;
  name: string;
  description: string | null;
  canvasState: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("templates") === "1") {
      setShowTemplatePicker(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          repoUrl: repoUrl.trim() || undefined,
          canvasState: selectedTemplate?.canvasState,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "AI_NOT_CONFIGURED") {
          router.push("/settings?setup=anthropic");
          return;
        }
        setError(data.error || "Failed to create project");
        return;
      }
      router.push(`/project/${data.id}`);
    } catch {
      setError("Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectTemplate(template: Template) {
    setSelectedTemplate(template);
    setShowTemplatePicker(false);
    if (!name.trim()) setName(`${template.name} - Copy`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-lg px-4 py-16">
        <Link
          href="/app"
          className="mb-8 inline-block text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="mb-2 text-2xl font-bold">Map a project</h1>
        <p className="mb-8 text-[var(--muted-foreground)]">
          Start from a public repository, one of your saved maps, or a blank architecture map.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Start from Template</h2>
              <button
                type="button"
                onClick={() => setShowTemplatePicker(true)}
                className="text-sm text-[var(--color-client)] hover:underline"
              >
                Browse templates
              </button>
            </div>
            {selectedTemplate ? (
              <div className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--background)] p-2">
                <div>
                  <div className="text-sm font-medium">{selectedTemplate.name}</div>
                  {selectedTemplate.description && (
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {selectedTemplate.description}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(null)}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Optionally reuse one of your saved architecture maps.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Project Name <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App Architecture"
              autoFocus={!showTemplatePicker}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium">
              Description <span className="text-[var(--muted-foreground)]">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what you're building..."
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <div>
            <label htmlFor="repoUrl" className="mb-1 block text-sm font-medium">
              Public GitHub repository{" "}
              <span className="text-[var(--muted-foreground)]">(optional)</span>
            </label>
            <input
              id="repoUrl"
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="owner/repo"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Public GitHub repositories only. Analysis uses your Anthropic API key.
            </p>
          </div>
          {error && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[var(--brand)] px-4 py-2 font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </form>

        {showTemplatePicker && (
          <TemplatePicker
            onSelectTemplate={handleSelectTemplate}
            onCancel={() => setShowTemplatePicker(false)}
          />
        )}
      </div>
    </main>
  );
}
