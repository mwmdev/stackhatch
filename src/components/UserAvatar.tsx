"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function UserAvatar() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = "none";
    if (e.currentTarget.nextElementSibling) {
      (e.currentTarget.nextElementSibling as HTMLElement).style.display = "flex";
    }
  };

  if (!session?.user) {
    return null;
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] hover:bg-[var(--muted)]"
        title={`${session.user.name} - Click for options`}
        aria-label="User menu"
      >
        {/* GitHub Avatar */}
        {session.user.image && (
          <img
            src={session.user.image}
            alt={session.user.name || "User avatar"}
            className="h-full w-full rounded-full object-cover"
            onError={handleAvatarError}
          />
        )}

        {/* Fallback: User initials */}
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-client)] text-xs font-medium text-white"
          style={{
            display: session.user.image ? "none" : "flex"
          }}
        >
          {getInitials(session.user.name)}
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
        >
          {/* User Info */}
          <div className="border-b border-[var(--border)] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User avatar"}
                    className="h-full w-full rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      if (e.currentTarget.nextElementSibling) {
                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = "flex";
                      }
                    }}
                  />
                ) : null}
                {(!session.user.image) && (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-client)] text-sm font-medium text-white">
                    {getInitials(session.user.name)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[var(--card-foreground)]">
                  {session.user.name || "Unknown User"}
                </div>
                {session.user.email && (
                  <div className="truncate text-sm text-[var(--muted-foreground)]">
                    {session.user.email}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sign Out Button */}
          <div className="p-1">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}