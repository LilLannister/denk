"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { RestaurantAccessDeniedError } from "@/lib/staff-authorization";
import {
  RestaurantTableNotFoundError,
  TableSessionAlreadyOpenError,
  openTableSession,
} from "@/lib/table-session";

export type OpenTableSessionState = {
  status: "idle" | "success" | "error";
  message?: string;
  joinCode?: string;
};

export async function openTableSessionAction(
  _previousState: OpenTableSessionState,
  formData: FormData,
): Promise<OpenTableSessionState> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const parsedTableId = z
    .string()
    .min(1)
    .safeParse(formData.get("restaurantTableId"));

  if (!parsedTableId.success) {
    return {
      status: "error",
      message: "Invalid table.",
    };
  }

  try {
    const result = await openTableSession({
      userId: session.user.id,
      restaurantTableId: parsedTableId.data,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Table session opened.",
      joinCode: result.joinCode,
    };
  } catch (error) {
    if (error instanceof TableSessionAlreadyOpenError) {
      return {
        status: "error",
        message: "This table already has an open session.",
      };
    }

    if (
      error instanceof RestaurantAccessDeniedError ||
      error instanceof RestaurantTableNotFoundError
    ) {
      return {
        status: "error",
        message: "You cannot open a session for this table.",
      };
    }

    console.error("Failed to open table session", error);

    return {
      status: "error",
      message: "The table session could not be opened.",
    };
  }
}
