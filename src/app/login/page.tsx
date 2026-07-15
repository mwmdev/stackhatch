import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth-config";
import AuthStartForm from "@/components/AuthStartForm";
import ThemeToggle from "@/components/ThemeToggle";
import {
  projectStartMethodFromPath,
  repositoryFromProjectStartPath,
  safeInternalPath,
} from "@/lib/project-start";

export function safeCallbackUrl(value: string | undefined, siteOrigin?: string) {
  return safeInternalPath(value, "/app", siteOrigin);
}

export function repoFromCallbackUrl(callbackUrl: string) {
  return repositoryFromProjectStartPath(callbackUrl);
}

const START_CONTEXT = {
  blank: {
    title: "Blank canvas ready",
    description: "Sign in with GitHub and StackHatch will open a new blank architecture map.",
  },
  requirements: {
    title: "Requirements upload ready",
    description: "Sign in with GitHub, then return to upload your Markdown or text brief.",
  },
  repository: {
    title: "Repository mapping ready",
    description: "Sign in with GitHub, then return to enter the public repository you want to map.",
  },
  template: {
    title: "Template selection ready",
    description: "Sign in with GitHub, then return to choose one of your saved architecture maps.",
  },
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params?.callbackUrl);
  const repo = repoFromCallbackUrl(callbackUrl);
  const startMethod = projectStartMethodFromPath(callbackUrl);
  const startContext = startMethod ? START_CONTEXT[startMethod] : null;

  // Check if user is already authenticated
  const session = await auth();
  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight">StackHatch</span>
          <ThemeToggle />
        </div>
      </header>

      {/* Login Content */}
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center">
            {/* App Logo/Name */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight">
                Turn what you have into an architecture map.
              </h1>
              <p className="mt-2 text-[var(--muted-foreground)]">
                Sign in with GitHub to save the map, ask questions, and revisit it as the project
                changes.
              </p>
            </div>

            {/* Sign in card */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--card-foreground)]">
                {repo
                  ? `Repository ready: ${repo}`
                  : (startContext?.title ?? "Continue to your maps")}
              </h2>
              <p className="mb-4 mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {repo
                  ? "Your repository is ready. Sign in with GitHub, then connect your own Anthropic key to generate its architecture map."
                  : (startContext?.description ??
                    "Use GitHub to keep your architecture maps connected to your account.")}
              </p>

              {/* GitHub Sign In Button */}
              <AuthStartForm
                startMethod={startMethod ?? undefined}
                action={async () => {
                  "use server";
                  await signIn("github", { redirectTo: callbackUrl });
                }}
              >
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                  Continue with GitHub
                </button>
              </AuthStartForm>

              <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                StackHatch analyzes public repositories only. Signing in does not grant access to
                private repositories.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
