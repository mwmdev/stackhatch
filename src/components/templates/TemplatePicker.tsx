"use client";

import { useState, useEffect } from "react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  canvasState: string; // JSON string
  createdBy: string;
  createdAt: number;
}

interface Team {
  id: string;
  name: string;
}

interface TemplatePickerProps {
  onSelectTemplate: (template: Template) => void;
  onCancel: () => void;
}

export default function TemplatePicker({ onSelectTemplate, onCancel }: TemplatePickerProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load user's teams on component mount
  useEffect(() => {
    async function loadTeams() {
      try {
        const res = await fetch("/api/teams");
        if (!res.ok) return;

        const teamsData = await res.json();
        setTeams(teamsData);

        // Auto-select first team if available
        if (teamsData.length > 0) {
          setSelectedTeamId(teamsData[0].id);
        }
      } catch {
        // Teams API might not exist yet, handle gracefully
      }
    }
    loadTeams();
  }, []);

  // Load templates when team is selected
  useEffect(() => {
    if (!selectedTeamId) {
      setTemplates([]);
      return;
    }

    async function loadTemplates() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/teams/${selectedTeamId}/templates`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load templates");
          return;
        }

        const templatesData = await res.json();
        setTemplates(templatesData);
      } catch {
        setError("Failed to load templates");
      } finally {
        setLoading(false);
      }
    }

    loadTemplates();
  }, [selectedTeamId]);

  const generateThumbnail = (canvasState: string): string => {
    try {
      const parsed = JSON.parse(canvasState);
      const nodeCount = parsed.nodes?.length || 0;
      const edgeCount = parsed.edges?.length || 0;

      if (nodeCount === 0) return "Empty template";

      const categories = new Set(parsed.nodes?.map((n: any) => n.category) || []);
      const categoryList = Array.from(categories).slice(0, 3).join(", ");

      return `${nodeCount} node${nodeCount !== 1 ? 's' : ''}, ${edgeCount} connection${edgeCount !== 1 ? 's' : ''}\nIncludes: ${categoryList}`;
    } catch {
      return "Invalid template data";
    }
  };

  if (teams.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="w-96 rounded-lg bg-[var(--card)] p-6 shadow-xl">
          <h3 className="mb-4 text-lg font-semibold">Start from Template</h3>
          <p className="mb-4 text-[var(--muted-foreground)]">
            Templates are only available for team projects. Join a team or upgrade to access shared templates.
          </p>
          <div className="flex justify-end">
            <button
              onClick={onCancel}
              className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-[600px] max-h-[80vh] rounded-lg bg-[var(--card)] shadow-xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="mb-4 text-lg font-semibold">Start from Template</h3>

          {/* Team selector */}
          <div className="mb-4">
            <label htmlFor="team-select" className="mb-2 block text-sm font-medium">
              Select Team
            </label>
            <select
              id="team-select"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Templates list */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-[var(--muted-foreground)]">Loading templates...</div>
          ) : error ? (
            <div className="text-center text-red-500">{error}</div>
          ) : templates.length === 0 ? (
            <div className="text-center text-[var(--muted-foreground)]">
              No templates available for this team.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="cursor-pointer rounded border border-[var(--border)] p-4 hover:bg-[var(--muted)] transition-colors"
                  onClick={() => onSelectTemplate(template)}
                >
                  <h4 className="font-medium mb-2">{template.name}</h4>
                  {template.description && (
                    <p className="text-sm text-[var(--muted-foreground)] mb-2">
                      {template.description}
                    </p>
                  )}
                  <div className="text-xs text-[var(--muted-foreground)] whitespace-pre-line">
                    {generateThumbnail(template.canvasState)}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-2">
                    Created {new Date(template.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}