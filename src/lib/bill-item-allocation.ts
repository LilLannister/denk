import { z } from "zod";

import { hashGuestToken } from "./guest-token";
import { lockBillItem } from "./bill-item-lock";
import { lockOpenTableSession } from "./open-table-session-lock";
import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";

const maximumDatabaseInteger = 2_147_483_647;

const allocationMutationSchema = z.object({
  publicTableId: z.string().min(1),
  token: z.string().min(1),
  billItemId: z.string().min(1),
  quantity: z.number().int().positive().max(maximumDatabaseInteger),
});

export class InvalidBillItemAllocationError extends Error {
  constructor() {
    super("Allocation details are invalid");
    this.name = "InvalidBillItemAllocationError";
  }
}

export class GuestAllocationDeniedError extends Error {
  constructor() {
    super("Guest allocation access denied");
    this.name = "GuestAllocationDeniedError";
  }
}

export class BillItemAllocationUnavailableError extends Error {
  constructor() {
    super("Requested bill item units are unavailable");
    this.name = "BillItemAllocationUnavailableError";
  }
}

async function findGuestCandidate(token: string) {
  return prisma.guestSession.findUnique({
    where: {
      tokenHash: hashGuestToken(token),
    },
    select: {
      id: true,
      tableSession: {
        select: {
          restaurantTableId: true,
        },
      },
    },
  });
}

async function requireGuestInsideTransaction({
  transaction,
  guestSessionId,
  restaurantTableId,
  publicTableId,
  now,
}: {
  transaction: Prisma.TransactionClient;
  guestSessionId: string;
  restaurantTableId: string;
  publicTableId: string;
  now: Date;
}) {
  const openSession = await lockOpenTableSession(
    transaction,
    restaurantTableId,
  );

  if (!openSession) {
    throw new GuestAllocationDeniedError();
  }

  const guestSession = await transaction.guestSession.findUnique({
    where: {
      id: guestSessionId,
    },
    select: {
      id: true,
      tableSessionId: true,
      expiresAt: true,
      revokedAt: true,
      tableSession: {
        select: {
          closedAt: true,
          restaurantTable: {
            select: {
              publicId: true,
            },
          },
        },
      },
    },
  });

  if (
    !guestSession ||
    guestSession.revokedAt ||
    guestSession.expiresAt <= now ||
    guestSession.tableSession.closedAt ||
    guestSession.tableSessionId !== openSession.id ||
    guestSession.tableSession.restaurantTable.publicId !== publicTableId
  ) {
    throw new GuestAllocationDeniedError();
  }

  return guestSession;
}

function sumAllocatedQuantity(quantities: number[]) {
  return quantities.reduce((total, quantity) => {
    const nextTotal = total + quantity;

    if (!Number.isSafeInteger(nextTotal)) {
      throw new BillItemAllocationUnavailableError();
    }

    return nextTotal;
  }, 0);
}

export async function claimBillItemUnits(
  input: {
    publicTableId: string;
    token: string;
    billItemId: string;
    quantity: number;
  },
  now = new Date(),
) {
  const parsedInput = allocationMutationSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidBillItemAllocationError();
  }

  const guestCandidate = await findGuestCandidate(parsedInput.data.token);

  if (!guestCandidate) {
    throw new GuestAllocationDeniedError();
  }

  return prisma.$transaction(async (transaction) => {
    const guestSession = await requireGuestInsideTransaction({
      transaction,
      guestSessionId: guestCandidate.id,
      restaurantTableId: guestCandidate.tableSession.restaurantTableId,
      publicTableId: parsedInput.data.publicTableId,
      now,
    });

    const billItem = await lockBillItem(transaction, {
      billItemId: parsedInput.data.billItemId,
      tableSessionId: guestSession.tableSessionId,
    });

    if (!billItem) {
      throw new BillItemAllocationUnavailableError();
    }

    const existingAllocations = await transaction.billItemAllocation.findMany({
      where: {
        billItemId: billItem.id,
      },
      select: {
        quantity: true,
      },
    });

    const allocatedQuantity = sumAllocatedQuantity(
      existingAllocations.map((allocation) => allocation.quantity),
    );

    const availableQuantity = billItem.quantity - allocatedQuantity;

    if (
      !Number.isSafeInteger(availableQuantity) ||
      parsedInput.data.quantity > availableQuantity
    ) {
      throw new BillItemAllocationUnavailableError();
    }

    return transaction.billItemAllocation.upsert({
      where: {
        guestSessionId_billItemId: {
          guestSessionId: guestSession.id,
          billItemId: billItem.id,
        },
      },
      create: {
        tableSessionId: guestSession.tableSessionId,
        guestSessionId: guestSession.id,
        billItemId: billItem.id,
        quantity: parsedInput.data.quantity,
      },
      update: {
        quantity: {
          increment: parsedInput.data.quantity,
        },
      },
    });
  });
}

export async function releaseBillItemUnits(
  input: {
    publicTableId: string;
    token: string;
    billItemId: string;
    quantity: number;
  },
  now = new Date(),
) {
  const parsedInput = allocationMutationSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new InvalidBillItemAllocationError();
  }

  const guestCandidate = await findGuestCandidate(parsedInput.data.token);

  if (!guestCandidate) {
    throw new GuestAllocationDeniedError();
  }

  return prisma.$transaction(async (transaction) => {
    const guestSession = await requireGuestInsideTransaction({
      transaction,
      guestSessionId: guestCandidate.id,
      restaurantTableId: guestCandidate.tableSession.restaurantTableId,
      publicTableId: parsedInput.data.publicTableId,
      now,
    });

    const billItem = await lockBillItem(transaction, {
      billItemId: parsedInput.data.billItemId,
      tableSessionId: guestSession.tableSessionId,
    });

    if (!billItem) {
      throw new BillItemAllocationUnavailableError();
    }

    const allocation = await transaction.billItemAllocation.findUnique({
      where: {
        guestSessionId_billItemId: {
          guestSessionId: guestSession.id,
          billItemId: billItem.id,
        },
      },
    });

    if (!allocation || parsedInput.data.quantity > allocation.quantity) {
      throw new BillItemAllocationUnavailableError();
    }

    if (parsedInput.data.quantity === allocation.quantity) {
      return transaction.billItemAllocation.delete({
        where: {
          id: allocation.id,
        },
      });
    }

    return transaction.billItemAllocation.update({
      where: {
        id: allocation.id,
      },
      data: {
        quantity: {
          decrement: parsedInput.data.quantity,
        },
      },
    });
  });
}
