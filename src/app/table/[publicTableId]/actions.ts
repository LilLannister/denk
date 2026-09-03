"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { GuestJoinDeniedError, joinTableSession } from "@/lib/guest-session";
import { GUEST_SESSION_COOKIE_NAME } from "@/lib/guest-session-cookie";

export type JoinTableState = {
  status: "idle" | "error";
  message?: string;
};

export async function joinTableAction(
  _previousState: JoinTableState,
  formData: FormData,
): Promise<JoinTableState> {
  const input = z
    .object({
      publicTableId: z.string().min(1),
      joinCode: z.string().regex(/^\d{6}$/),
    })
    .safeParse({
      publicTableId: formData.get("publicTableId"),
      joinCode: formData.get("joinCode"),
    });

  if (!input.success) {
    return {
      status: "error",
      message: "The table or join code is invalid.",
    };
  }

  let joined;

  try {
    joined = await joinTableSession(input.data);
  } catch (error) {
    if (error instanceof GuestJoinDeniedError) {
      return {
        status: "error",
        message: "The table or join code is invalid.",
      };
    }

    console.error("Failed to join table session", error);

    return {
      status: "error",
      message: "The table could not be joined.",
    };
  }

  const cookieStore = await cookies();

  cookieStore.set(GUEST_SESSION_COOKIE_NAME, joined.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: joined.guestSession.expiresAt,
  });

  redirect(`/table/${encodeURIComponent(input.data.publicTableId)}`);
}
