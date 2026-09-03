"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);

    await authClient.signOut();

    router.replace("/staff/sign-in");
    router.refresh();
  }

  return (
    <button
      className="rounded border px-3 py-2 text-sm disabled:opacity-50"
      type="button"
      disabled={isSigningOut}
      onClick={handleSignOut}
    >
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
