"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { GuestJoinDeniedError, joinTableSession } from "@/lib/guest-session";
import { GUEST_SESSION_COOKIE_NAME } from "@/lib/guest-session-cookie";

import { isJoinCode, normalizeJoinCode } from "@/lib/join-code";

import {
  BillItemAllocationUnavailableError,
  GuestAllocationDeniedError,
  InvalidBillItemAllocationError,
  claimBillItemUnits,
  releaseBillItemUnits,
} from "@/lib/bill-item-allocation";

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
      joinCode: z.string().transform(normalizeJoinCode).refine(isJoinCode),
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
    path: `/table/${encodeURIComponent(input.data.publicTableId)}`,
    expires: joined.guestSession.expiresAt,
  });

  redirect(`/table/${encodeURIComponent(input.data.publicTableId)}`);
}

export type BillItemAllocationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const allocationActionSchema = z.object({
  publicTableId: z.string().min(1),
  billItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(2_147_483_647),
});

async function runAllocationAction({
  operation,
  formData,
}: {
  operation: "claim" | "release";
  formData: FormData;
}): Promise<BillItemAllocationActionState> {
  const input = allocationActionSchema.safeParse({
    publicTableId: formData.get("publicTableId"),
    billItemId: formData.get("billItemId"),
    quantity: formData.get("quantity"),
  });

  if (!input.success) {
    return {
      status: "error",
      message: "Choose a valid whole-unit quantity.",
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return {
      status: "error",
      message: "Your guest access is unavailable. Join the table again.",
    };
  }

  try {
    if (operation === "claim") {
      await claimBillItemUnits({
        publicTableId: input.data.publicTableId,
        token,
        billItemId: input.data.billItemId,
        quantity: input.data.quantity,
      });
    } else {
      await releaseBillItemUnits({
        publicTableId: input.data.publicTableId,
        token,
        billItemId: input.data.billItemId,
        quantity: input.data.quantity,
      });
    }
  } catch (error) {
    if (error instanceof InvalidBillItemAllocationError) {
      return {
        status: "error",
        message: "Choose a valid whole-unit quantity.",
      };
    }

    if (error instanceof GuestAllocationDeniedError) {
      return {
        status: "error",
        message: "Your guest access is unavailable. Join the table again.",
      };
    }

    if (error instanceof BillItemAllocationUnavailableError) {
      revalidatePath(`/table/${encodeURIComponent(input.data.publicTableId)}`);

      return {
        status: "error",
        message:
          operation === "claim"
            ? "Those units are no longer available."
            : "You cannot release that many units.",
      };
    }

    console.error(`Failed to ${operation} bill item units`, error);

    return {
      status: "error",
      message: "The bill could not be updated.",
    };
  }

  revalidatePath(`/table/${encodeURIComponent(input.data.publicTableId)}`);

  return {
    status: "success",
    message: operation === "claim" ? "Item claimed." : "Item released.",
  };
}

export async function claimBillItemAction(
  _previousState: BillItemAllocationActionState,
  formData: FormData,
): Promise<BillItemAllocationActionState> {
  return runAllocationAction({
    operation: "claim",
    formData,
  });
}

export async function releaseBillItemAction(
  _previousState: BillItemAllocationActionState,
  formData: FormData,
): Promise<BillItemAllocationActionState> {
  return runAllocationAction({
    operation: "release",
    formData,
  });
}
