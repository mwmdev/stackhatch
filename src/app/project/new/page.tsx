import ProjectStartWorkspace from "@/components/projects/ProjectStartWorkspace";
import { isProjectStartMethod } from "@/lib/project-start";

type QueryValue = string | string[] | undefined;

function singleValue(value: QueryValue) {
  return typeof value === "string" ? value : undefined;
}

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams?: Promise<{
    mode?: QueryValue;
  }>;
}) {
  const params = await searchParams;
  const requestedMode = singleValue(params?.mode);
  const initialMode = isProjectStartMethod(requestedMode) ? requestedMode : null;

  return <ProjectStartWorkspace initialMode={initialMode} />;
}
