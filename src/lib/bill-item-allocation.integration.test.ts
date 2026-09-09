import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BillItemAllocationUnavailableError,
  GuestAllocationDeniedError,
  InvalidBillItemAllocationError,
  claimBillItemUnits,
  releaseBillItemUnits,
} from "./bill-item-allocation";
import { hashGuestToken } from "./guest-token";
import { prisma } from "./prisma";

const now = new Date("2026-09-09T12:00:00.000Z");
const guestToken = "allocation-guest-token";
const otherGuestToken = "other-allocation-guest-token";
const revokedGuestToken = "revoked-allocation-guest-token";
const expiredGuestToken = "expired-allocation-guest-token";

let restaurantId: string;
let publicTableId: string;
let otherPublicTableId: string;
let tableSessionId: string;
let otherTableSessionId: string;
let billItemId: string;
let singleUnitBillItemId: string;
let otherBillItemId: string;
let guestSessionId: string;

beforeEach(async () => {
  const suffix = randomUUID();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Allocation Restaurant ${suffix}`,
    },
  });

  const restaurantTable = await prisma.restaurantTable.create({
    data: {
      restaurantId: restaurant.id,
      name: `Allocation Table ${suffix}`,
    },
  });

  const otherRestaurantTable = await prisma.restaurantTable.create({
    data: {
      restaurantId: restaurant.id,
      name: `Other Allocation Table ${suffix}`,
    },
  });

  const tableSession = await prisma.tableSession.create({
    data: {
      restaurantTableId: restaurantTable.id,
      joinCodeDigest: `allocation-code-${suffix}`,
      joinCodeExpiresAt: new Date("2026-09-09T13:00:00.000Z"),
    },
  });

  const otherTableSession = await prisma.tableSession.create({
    data: {
      restaurantTableId: otherRestaurantTable.id,
      joinCodeDigest: `other-allocation-code-${suffix}`,
      joinCodeExpiresAt: new Date("2026-09-09T13:00:00.000Z"),
    },
  });

  const billItem = await prisma.billItem.create({
    data: {
      tableSessionId: tableSession.id,
      name: "Tea",
      quantity: 3,
      unitPriceMinor: 2_550,
    },
  });

  const singleUnitBillItem = await prisma.billItem.create({
    data: {
      tableSessionId: tableSession.id,
      name: "Cheesecake",
      quantity: 1,
      unitPriceMinor: 15_000,
    },
  });

  const otherBillItem = await prisma.billItem.create({
    data: {
      tableSessionId: otherTableSession.id,
      name: "Coffee",
      quantity: 2,
      unitPriceMinor: 7_500,
    },
  });

  const guestSession = await prisma.guestSession.create({
    data: {
      tableSessionId: tableSession.id,
      tokenHash: hashGuestToken(guestToken),
      expiresAt: new Date("2026-09-10T00:00:00.000Z"),
    },
  });

  await prisma.guestSession.create({
    data: {
      tableSessionId: tableSession.id,
      tokenHash: hashGuestToken(otherGuestToken),
      expiresAt: new Date("2026-09-10T00:00:00.000Z"),
    },
  });

  await prisma.guestSession.createMany({
    data: [
      {
        tableSessionId: tableSession.id,
        tokenHash: hashGuestToken(revokedGuestToken),
        expiresAt: new Date("2026-09-10T00:00:00.000Z"),
        revokedAt: new Date("2026-09-09T11:00:00.000Z"),
      },
      {
        tableSessionId: tableSession.id,
        tokenHash: hashGuestToken(expiredGuestToken),
        expiresAt: now,
      },
    ],
  });

  restaurantId = restaurant.id;
  publicTableId = restaurantTable.publicId;
  otherPublicTableId = otherRestaurantTable.publicId;
  tableSessionId = tableSession.id;
  otherTableSessionId = otherTableSession.id;
  billItemId = billItem.id;
  singleUnitBillItemId = singleUnitBillItem.id;
  otherBillItemId = otherBillItem.id;
  guestSessionId = guestSession.id;
});

afterEach(async () => {
  await prisma.billItemAllocation.deleteMany({
    where: {
      tableSessionId: {
        in: [tableSessionId, otherTableSessionId],
      },
    },
  });

  await prisma.restaurant.delete({
    where: {
      id: restaurantId,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("whole-item allocation", () => {
  it("claims available units and aggregates repeated claims", async () => {
    const firstClaim = await claimBillItemUnits(
      {
        publicTableId,
        token: guestToken,
        billItemId,
        quantity: 1,
      },
      now,
    );

    const secondClaim = await claimBillItemUnits(
      {
        publicTableId,
        token: guestToken,
        billItemId,
        quantity: 2,
      },
      now,
    );

    expect(firstClaim.quantity).toBe(1);
    expect(secondClaim).toMatchObject({
      id: firstClaim.id,
      tableSessionId,
      guestSessionId,
      billItemId,
      quantity: 3,
    });

    await expect(
      prisma.billItemAllocation.count({
        where: {
          guestSessionId,
          billItemId,
        },
      }),
    ).resolves.toBe(1);
  });

  it("rejects a claim exceeding the available quantity without writing", async () => {
    await expect(
      claimBillItemUnits(
        {
          publicTableId,
          token: guestToken,
          billItemId,
          quantity: 4,
        },
        now,
      ),
    ).rejects.toThrow(BillItemAllocationUnavailableError);

    await expect(
      prisma.billItemAllocation.count({
        where: {
          tableSessionId,
        },
      }),
    ).resolves.toBe(0);
  });

  it("allows only one concurrent claim for the final unit", async () => {
    const results = await Promise.allSettled([
      claimBillItemUnits(
        {
          publicTableId,
          token: guestToken,
          billItemId: singleUnitBillItemId,
          quantity: 1,
        },
        now,
      ),
      claimBillItemUnits(
        {
          publicTableId,
          token: otherGuestToken,
          billItemId: singleUnitBillItemId,
          quantity: 1,
        },
        now,
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    await expect(
      prisma.billItemAllocation.aggregate({
        where: {
          billItemId: singleUnitBillItemId,
        },
        _sum: {
          quantity: true,
        },
      }),
    ).resolves.toMatchObject({
      _sum: {
        quantity: 1,
      },
    });
  });

  it("decrements and then removes the guest's allocation", async () => {
    const allocation = await claimBillItemUnits(
      {
        publicTableId,
        token: guestToken,
        billItemId,
        quantity: 3,
      },
      now,
    );

    const reducedAllocation = await releaseBillItemUnits(
      {
        publicTableId,
        token: guestToken,
        billItemId,
        quantity: 1,
      },
      now,
    );

    expect(reducedAllocation).toMatchObject({
      id: allocation.id,
      quantity: 2,
    });

    await releaseBillItemUnits(
      {
        publicTableId,
        token: guestToken,
        billItemId,
        quantity: 2,
      },
      now,
    );

    await expect(
      prisma.billItemAllocation.findUnique({
        where: {
          id: allocation.id,
        },
      }),
    ).resolves.toBeNull();
  });

  it("cannot release units claimed by another guest", async () => {
    const allocation = await claimBillItemUnits(
      {
        publicTableId,
        token: guestToken,
        billItemId,
        quantity: 1,
      },
      now,
    );

    await expect(
      releaseBillItemUnits(
        {
          publicTableId,
          token: otherGuestToken,
          billItemId,
          quantity: 1,
        },
        now,
      ),
    ).rejects.toThrow(BillItemAllocationUnavailableError);

    await expect(
      prisma.billItemAllocation.findUnique({
        where: {
          id: allocation.id,
        },
      }),
    ).resolves.toMatchObject({
      guestSessionId,
      quantity: 1,
    });
  });

  it.each([
    {
      description: "an unknown token",
      token: "unknown-token",
      publicTableId: () => publicTableId,
    },
    {
      description: "a revoked guest",
      token: revokedGuestToken,
      publicTableId: () => publicTableId,
    },
    {
      description: "an expired guest",
      token: expiredGuestToken,
      publicTableId: () => publicTableId,
    },
    {
      description: "the wrong public table",
      token: guestToken,
      publicTableId: () => otherPublicTableId,
    },
  ])("rejects $description", async ({ token, publicTableId: getPublicId }) => {
    await expect(
      claimBillItemUnits(
        {
          publicTableId: getPublicId(),
          token,
          billItemId,
          quantity: 1,
        },
        now,
      ),
    ).rejects.toThrow(GuestAllocationDeniedError);
  });

  it("rejects a bill item from another table session", async () => {
    await expect(
      claimBillItemUnits(
        {
          publicTableId,
          token: guestToken,
          billItemId: otherBillItemId,
          quantity: 1,
        },
        now,
      ),
    ).rejects.toThrow(BillItemAllocationUnavailableError);
  });

  it("rejects allocation after the table session closes", async () => {
    await prisma.tableSession.update({
      where: {
        id: tableSessionId,
      },
      data: {
        closedAt: now,
      },
    });

    await expect(
      claimBillItemUnits(
        {
          publicTableId,
          token: guestToken,
          billItemId,
          quantity: 1,
        },
        now,
      ),
    ).rejects.toThrow(GuestAllocationDeniedError);
  });

  it.each([0, -1, 1.5, 2_147_483_648])(
    "rejects invalid mutation quantity %s",
    async (quantity) => {
      await expect(
        claimBillItemUnits(
          {
            publicTableId,
            token: guestToken,
            billItemId,
            quantity,
          },
          now,
        ),
      ).rejects.toThrow(InvalidBillItemAllocationError);
    },
  );
});
