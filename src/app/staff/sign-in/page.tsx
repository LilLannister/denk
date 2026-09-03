"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export default function StaffSignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    const result = await authClient.signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });

    setIsSubmitting(false);

    if (result.error) {
      setError("Invalid email or password.");
      return;
    }

    router.replace("/staff");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Staff sign in</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign in with your DENK staff account.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
