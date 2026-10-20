import type { Metadata } from "next";
import ProjectStartWorkspace from "@/components/projects/ProjectStartWorkspace";

export const metadata: Metadata = { title: "New map" };

export default function NewProjectPage() {
  return <ProjectStartWorkspace initialMode={null} />;
}
