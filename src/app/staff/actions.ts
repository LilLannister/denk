"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { RestaurantAccessDeniedError } from "@/lib/staff-authorization";
import {
  RestaurantTableInactiveError,
  RestaurantTableNotFoundError,
  TableSessionAlreadyOpenError,
  TableSessionNotOpenError,
  closeTableSession,
  openTableSession,
  rotateTableSessionJoinCode,
} from "@/lib/table-session";

import {
  BillItemCatalogItemUnavailableError,
  BillItemNotFoundError,
  BillItemTableNotFoundError,
  BillItemTableSessionNotOpenError,
  InvalidBillItemError,
  addBillItem,
  removeBillItem,
  updateBillItemQuantity,
} from "@/lib/bill-item";

import {
  InvalidRestaurantTableError,
  ManagedRestaurantTableNotFoundError,
  RestaurantTableHasOpenSessionError,
  RestaurantTableNameConflictError,
  createRestaurantTable,
  renameRestaurantTable,
  setRestaurantTableActive,
} from "@/lib/restaurant-table";

export type RestaurantTableManagementState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const createRestaurantTableFormSchema = z.object({
  restaurantId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

const renameRestaurantTableFormSchema = z.object({
  restaurantTableId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

const setRestaurantTableActiveFormSchema = z.object({
  restaurantTableId: z.string().min(1),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type OpenTableSessionState = {
  status: "idle" | "success" | "error";
  message?: string;
  joinCode?: string;
};

export async function createRestaurantTableAction(
  _previousState: RestaurantTableManagementState,
  formData: FormData,
): Promise<RestaurantTableManagementState> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const parsedForm = createRestaurantTableFormSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
  });

  if (!parsedForm.success) {
    return {
      status: "error",
      message: "Enter a valid table name.",
    };
  }

  try {
    await createRestaurantTable({
      userId: session.user.id,
      restaurantId: parsedForm.data.restaurantId,
      name: parsedForm.data.name,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Table created.",
    };
  } catch (error) {
    if (error instanceof InvalidRestaurantTableError) {
      return {
        status: "error",
        message: "Enter a valid table name.",
      };
    }

    if (error instanceof RestaurantTableNameConflictError) {
      return {
        status: "error",
        message: "A table with this name already exists.",
      };
    }

    if (error instanceof RestaurantAccessDeniedError) {
      return {
        status: "error",
        message: "You cannot manage tables for this restaurant.",
      };
    }

    console.error("Failed to create restaurant table", error);

    return {
      status: "error",
      message: "The table could not be created.",
    };
  }
}

export async function renameRestaurantTableAction(
  _previousState: RestaurantTableManagementState,
  formData: FormData,
): Promise<RestaurantTableManagementState> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const parsedForm = renameRestaurantTableFormSchema.safeParse({
    restaurantTableId: formData.get("restaurantTableId"),
    name: formData.get("name"),
  });

  if (!parsedForm.success) {
    return {
      status: "error",
      message: "Enter a valid table name.",
    };
  }

  try {
    await renameRestaurantTable({
      userId: session.user.id,
      restaurantTableId: parsedForm.data.restaurantTableId,
      name: parsedForm.data.name,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Table renamed.",
    };
  } catch (error) {
    if (error instanceof InvalidRestaurantTableError) {
      return {
        status: "error",
        message: "Enter a valid table name.",
      };
    }

    if (error instanceof RestaurantTableNameConflictError) {
      return {
        status: "error",
        message: "A table with this name already exists.",
      };
    }

    if (
      error instanceof RestaurantAccessDeniedError ||
      error instanceof ManagedRestaurantTableNotFoundError
    ) {
      return {
        status: "error",
        message: "You cannot manage this table.",
      };
    }

    console.error("Failed to rename restaurant table", error);

    return {
      status: "error",
      message: "The table could not be renamed.",
    };
  }
}

export async function setRestaurantTableActiveAction(
  _previousState: RestaurantTableManagementState,
  formData: FormData,
): Promise<RestaurantTableManagementState> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const parsedForm = setRestaurantTableActiveFormSchema.safeParse({
    restaurantTableId: formData.get("restaurantTableId"),
    isActive: formData.get("isActive"),
  });

  if (!parsedForm.success) {
    return {
      status: "error",
      message: "Invalid table activation request.",
    };
  }

  try {
    await setRestaurantTableActive({
      userId: session.user.id,
      restaurantTableId: parsedForm.data.restaurantTableId,
      isActive: parsedForm.data.isActive,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: parsedForm.data.isActive
        ? "Table reactivated."
        : "Table deactivated.",
    };
  } catch (error) {
    if (error instanceof InvalidRestaurantTableError) {
      return {
        status: "error",
        message: "Invalid table activation request.",
      };
    }

    if (error instanceof RestaurantTableHasOpenSessionError) {
      return {
        status: "error",
        message: "Close the current bill before deactivating this table.",
      };
    }

    if (
      error instanceof RestaurantAccessDeniedError ||
      error instanceof ManagedRestaurantTableNotFoundError
    ) {
      return {
        status: "error",
        message: "You cannot manage this table.",
      };
    }

    console.error("Failed to change restaurant table activation", error);

    return {
      status: "error",
      message: "The table status could not be changed.",
    };
  }
}

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
    if (error instanceof RestaurantTableInactiveError) {
      return {
        status: "error",
        message: "Reactivate this table before opening a bill.",
      };
    }
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

export async function closeTableSessionAction(
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
    await closeTableSession({
      userId: session.user.id,
      restaurantTableId: parsedTableId.data,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Table session closed.",
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
        message: "You cannot close this table session.",
      };
    }

    console.error("Failed to close table session", error);

    return {
      status: "error",
      message: "The table session could not be closed.",
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

export type BillItemCorrectionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const updateBillItemQuantityFormSchema = z.object({
  restaurantTableId: z.string().min(1),
  billItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(2_147_483_647),
});

const removeBillItemFormSchema = z.object({
  restaurantTableId: z.string().min(1),
  billItemId: z.string().min(1),
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

export async function updateBillItemQuantityAction(
  _previousState: BillItemCorrectionState,
  formData: FormData,
): Promise<BillItemCorrectionState> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const parsedForm = updateBillItemQuantityFormSchema.safeParse({
    restaurantTableId: formData.get("restaurantTableId"),
    billItemId: formData.get("billItemId"),
    quantity: formData.get("quantity"),
  });

  if (!parsedForm.success) {
    return {
      status: "error",
      message: "Enter a valid positive quantity.",
    };
  }

  try {
    await updateBillItemQuantity({
      userId: session.user.id,
      restaurantTableId: parsedForm.data.restaurantTableId,
      billItemId: parsedForm.data.billItemId,
      quantity: parsedForm.data.quantity,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Bill item quantity updated.",
    };
  } catch (error) {
    if (error instanceof InvalidBillItemError) {
      return {
        status: "error",
        message: "Enter a valid quantity that keeps the bill total safe.",
      };
    }

    if (error instanceof BillItemNotFoundError) {
      return {
        status: "error",
        message: "This bill item is no longer available.",
      };
    }

    if (error instanceof BillItemTableSessionNotOpenError) {
      return {
        status: "error",
        message: "This table does not have an open session.",
      };
    }

    if (
      error instanceof RestaurantAccessDeniedError ||
      error instanceof BillItemTableNotFoundError
    ) {
      return {
        status: "error",
        message: "You cannot update items for this table.",
      };
    }

    console.error("Failed to update bill item quantity", error);

    return {
      status: "error",
      message: "The bill item quantity could not be updated.",
    };
  }
}

export async function removeBillItemAction(
  _previousState: BillItemCorrectionState,
  formData: FormData,
): Promise<BillItemCorrectionState> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/staff/sign-in");
  }

  const parsedForm = removeBillItemFormSchema.safeParse({
    restaurantTableId: formData.get("restaurantTableId"),
    billItemId: formData.get("billItemId"),
  });

  if (!parsedForm.success) {
    return {
      status: "error",
      message: "Invalid bill item.",
    };
  }

  try {
    await removeBillItem({
      userId: session.user.id,
      restaurantTableId: parsedForm.data.restaurantTableId,
      billItemId: parsedForm.data.billItemId,
    });

    revalidatePath("/staff");

    return {
      status: "success",
      message: "Bill item removed.",
    };
  } catch (error) {
    if (error instanceof BillItemNotFoundError) {
      return {
        status: "error",
        message: "This bill item is no longer available.",
      };
    }

    if (error instanceof BillItemTableSessionNotOpenError) {
      return {
        status: "error",
        message: "This table does not have an open session.",
      };
    }

    if (
      error instanceof RestaurantAccessDeniedError ||
      error instanceof BillItemTableNotFoundError
    ) {
      return {
        status: "error",
        message: "You cannot remove items from this table.",
      };
    }

    console.error("Failed to remove bill item", error);

    return {
      status: "error",
      message: "The bill item could not be removed.",
    };
  }
}
