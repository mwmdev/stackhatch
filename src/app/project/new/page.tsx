"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TemplatePicker from "@/components/templates/TemplatePicker";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    setSubmitting(true);
    try {
      const projectData: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        repoUrl: repoUrl.trim() || undefined,
      };

      // If creating from template, include the canvas state
      if (selectedTemplate) {
        projectData.canvasState = selectedTemplate.canvasState;
        // Note: teamId would be set by the backend if the template belongs to a team
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectData),
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
      setSubmitting(false);
    }
  }

  function handleSelectTemplate(template: any) {
    setSelectedTemplate(template);
    setShowTemplatePicker(false);
    // Pre-fill name if not already set
    if (!name.trim()) {
      setName(`${template.name} - Copy`);
    }
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

        <h1 className="mb-2 text-2xl font-bold">New Project</h1>
        <p className="mb-8 text-[var(--muted-foreground)]">
          Give your project a name and the AI will help you design its architecture.
        </p>

        {/* Template section */}
        <div className="mb-6 p-4 border border-[var(--border)] rounded-lg bg-[var(--muted)]/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Start from Template</h3>
            <button
              type="button"
              onClick={() => setShowTemplatePicker(true)}
              className="text-sm text-[var(--color-client)] hover:underline"
            >
              Browse Templates
            </button>
          </div>
          {selectedTemplate ? (
            <div className="flex items-center justify-between p-2 bg-[var(--background)] rounded border border-[var(--border)]">
              <div>
                <div className="font-medium text-sm">{selectedTemplate.name}</div>
                {selectedTemplate.description && (
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {selectedTemplate.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              Start with a pre-built template from your team library.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App Architecture"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
              autoFocus
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
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
            />
          </div>

          <div>
            <label htmlFor="repoUrl" className="mb-1 block text-sm font-medium">
              GitHub Repository URL{" "}
              <span className="text-[var(--muted-foreground)]">(optional)</span>
            </label>
            <input
              id="repoUrl"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Public GitHub repos only. The AI will analyze the repo and generate an architecture.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[var(--color-client)] px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </form>

        {/* Template Picker Modal */}
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
