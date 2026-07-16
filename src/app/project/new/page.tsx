import ProjectStartWorkspace from "@/components/projects/ProjectStartWorkspace";
import {
  isProjectStartMethod,
  isPublicRepositorySlug,
  safeProjectReturnPath,
} from "@/lib/project-start";

type QueryValue = string | string[] | undefined;

function singleValue(value: QueryValue) {
  return typeof value === "string" ? value : undefined;
}

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams?: Promise<{
    mode?: QueryValue;
    repo?: QueryValue;
    returnTo?: QueryValue;
  }>;
}) {
  const params = await searchParams;
  const requestedMode = singleValue(params?.mode);
  const initialMode = isProjectStartMethod(requestedMode) ? requestedMode : null;
  const requestedRepository = singleValue(params?.repo)?.trim() || "";
  const initialRepository =
    initialMode === "repository" && isPublicRepositorySlug(requestedRepository)
      ? requestedRepository
      : "";
  const returnTo = safeProjectReturnPath(singleValue(params?.returnTo));

  return (
    <ProjectStartWorkspace
      initialMode={initialMode}
      initialRepository={initialRepository}
      returnTo={returnTo}
    />
  );
}
