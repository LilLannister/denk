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
  TableSessionNotOpenError,
  rotateTableSessionJoinCode,
} from "@/lib/table-session";

import {
  BillItemCatalogItemUnavailableError,
  BillItemTableNotFoundError,
  BillItemTableSessionNotOpenError,
  InvalidBillItemError,
  addBillItem,
} from "@/lib/bill-item";

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

export async function rotateTableSessionJoinCodeAction(
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
    const result = await rotateTableSessionJoinCode({
      userId: session.user.id,
      restaurantTableId: parsedTableId.data,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "New join code generated.",
      joinCode: result.joinCode,
    };
  } catch (error) {
    if (error instanceof TableSessionNotOpenError) {
      return {
        status: "error",
        message: "This table does not have an open session.",
      };
    }

    if (
      error instanceof RestaurantAccessDeniedError ||
      error instanceof RestaurantTableNotFoundError
    ) {
      return {
        status: "error",
        message: "You cannot update this table.",
      };
    }

    console.error("Failed to rotate table join code", error);

    return {
      status: "error",
      message: "A new join code could not be generated.",
    };
  }
}

export type AddBillItemState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const addBillItemFormSchema = z.object({
  restaurantTableId: z.string().min(1),
  catalogItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export async function addBillItemAction(
  _previousState: AddBillItemState,
  formData: FormData,
): Promise<AddBillItemState> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const parsedForm = addBillItemFormSchema.safeParse({
    restaurantTableId: formData.get("restaurantTableId"),
    catalogItemId: formData.get("catalogItemId"),
    quantity: formData.get("quantity"),
  });

  if (!parsedForm.success) {
    return {
      status: "error",
      message: "Select a catalog item and enter a valid quantity.",
    };
  }

  try {
    await addBillItem({
      userId: session.user.id,
      restaurantTableId: parsedForm.data.restaurantTableId,
      catalogItemId: parsedForm.data.catalogItemId,
      quantity: parsedForm.data.quantity,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Bill item added.",
    };
  } catch (error) {
    if (error instanceof InvalidBillItemError) {
      return {
        status: "error",
        message: "Select a catalog item and enter a valid quantity.",
      };
    }

    if (error instanceof BillItemCatalogItemUnavailableError) {
      return {
        status: "error",
        message: "This catalog item is no longer available.",
      };
    }

    if (error instanceof BillItemTableSessionNotOpenError) {
      return {
        status: "error",
        message: "Open a table session before adding bill items.",
      };
    }

    if (
      error instanceof RestaurantAccessDeniedError ||
      error instanceof BillItemTableNotFoundError
    ) {
      return {
        status: "error",
        message: "You cannot add items to this table.",
      };
    }

    console.error("Failed to add bill item", error);

    return {
      status: "error",
      message: "The bill item could not be added.",
    };
  }
}
