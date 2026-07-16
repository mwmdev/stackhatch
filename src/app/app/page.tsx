import { redirect } from "next/navigation";
import AppResolver from "@/components/AppResolver";
import { getDb } from "@/db";
import { buildAppResumeProjectPath } from "@/lib/app-route";
import { getAuthenticatedUser } from "@/lib/auth";
import { resolveProjectResume } from "@/lib/project-resume";

type QueryValue = string | string[] | undefined;

export default async function AppPage({
  searchParams,
}: {
  searchParams?: Promise<{ resumeRecovery?: QueryValue }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?callbackUrl=%2Fapp");

  const project = resolveProjectResume(getDb(), user.userId);
  const params = await searchParams;
  const isRecovery = params?.resumeRecovery === "1";
  const destination = project
    ? buildAppResumeProjectPath(project.id, { recoverable: !isRecovery })
    : "/project/new";

  return <AppResolver destination={destination} />;
}
