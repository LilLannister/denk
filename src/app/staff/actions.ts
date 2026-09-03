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
  BillItemTableNotFoundError,
  BillItemTableSessionNotOpenError,
  InvalidBillItemError,
  addBillItem,
} from "@/lib/bill-item";
import { InvalidMoneyAmountError, parseAmountToMinorUnits } from "@/lib/money";

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
  name: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.string().min(1),
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
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unitPrice"),
  });

  if (!parsedForm.success) {
    return {
      status: "error",
      message: "Enter a valid name, quantity, and unit price.",
    };
  }

  try {
    await addBillItem({
      userId: session.user.id,
      restaurantTableId: parsedForm.data.restaurantTableId,
      name: parsedForm.data.name,
      quantity: parsedForm.data.quantity,
      unitPriceMinor: parseAmountToMinorUnits(parsedForm.data.unitPrice),
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Bill item added.",
    };
  } catch (error) {
    if (
      error instanceof InvalidBillItemError ||
      error instanceof InvalidMoneyAmountError
    ) {
      return {
        status: "error",
        message: "Enter a valid name, quantity, and unit price.",
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
