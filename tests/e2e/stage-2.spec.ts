import { expect, test } from "@playwright/test";

import { stage2Fixture } from "./stage-2-fixture";

import { GUEST_SESSION_COOKIE_NAME } from "../../src/lib/guest-session-cookie";

test("staff operates a bill across an anonymous guest journey", async ({
  browser,
}) => {
  const staffContext = await browser.newContext();
  const guestContext = await browser.newContext();

  try {
    const staffPage = await staffContext.newPage();

    await staffPage.goto("/staff");
    await expect(staffPage).toHaveURL(/\/staff\/sign-in$/);
    await staffPage.getByLabel("Email").fill(stage2Fixture.staffEmail);
    await staffPage.getByLabel("Password").fill(stage2Fixture.staffPassword);
    await staffPage.getByRole("button", { name: "Sign in" }).click();

    await expect(
      staffPage.getByRole("heading", { name: "Staff workspace" }),
    ).toBeVisible();

    const restaurantSection = staffPage
      .getByRole("heading", {
        name: stage2Fixture.restaurantName,
        level: 2,
      })
      .locator("..")
      .getByText(stage2Fixture.tableName, { exact: true })
      .locator("..");

    const guestTablePath = await restaurantSection
      .getByRole("link", {
        name: `Open guest page for ${stage2Fixture.tableName}`,
      })
      .getAttribute("href");

    expect(guestTablePath).not.toBeNull();

    await restaurantSection.getByRole("button", { name: "Open bill" }).click();

    const joinCodeElement = restaurantSection.getByText(
      /^[0-9A-HJKMNP-TV-Z]{8}$/,
    );

    await expect(joinCodeElement).toBeVisible();

    const joinCode = await joinCodeElement.textContent();

    expect(joinCode).not.toBeNull();

    await restaurantSection
      .getByLabel("Catalog item")
      .selectOption({ label: "E2E Shared Breakfast — ₺125.50" });
    await restaurantSection.getByLabel("Quantity").fill("2");
    await restaurantSection.getByRole("button", { name: "Add item" }).click();

    await expect(restaurantSection.getByText("Bill item added.")).toBeVisible();
    await expect(
      restaurantSection.getByText("2 × E2E Shared Breakfast at ₺125.50"),
    ).toBeVisible();
    await expect(restaurantSection.getByText("Total: ₺251.00")).toBeVisible();

    const guestPage = await guestContext.newPage();

    await guestPage.goto(guestTablePath!);
    await guestPage
      .getByLabel("Eight-character join code")
      .fill(joinCode!.toLowerCase());
    await guestPage.getByRole("button", { name: "Join table" }).click();

    await expect(
      guestPage.getByRole("heading", {
        name: stage2Fixture.tableName,
      }),
    ).toBeVisible();
    await expect(guestPage.getByText("2 × E2E Shared Breakfast")).toBeVisible();
    await expect(guestPage.getByText("Claimed: 0 of 2")).toBeVisible();
    await expect(guestPage.getByText("Available: 2 · Yours: 0")).toBeVisible();
    await expect(guestPage.getByText("Bill total: ₺251.00")).toBeVisible();
    await expect(guestPage.getByText("Claimed: ₺0.00")).toBeVisible();
    await expect(guestPage.getByText("Remaining: ₺251.00")).toBeVisible();
    await expect(guestPage.getByText("Your share: ₺0.00")).toBeVisible();

    const claimButton = guestPage.getByRole("button", {
      name: "Claim one E2E Shared Breakfast",
    });

    await claimButton.click();

    await expect(guestPage.getByText("Available: 1 · Yours: 1")).toBeVisible();
    await expect(guestPage.getByText("Your share: ₺125.50")).toBeVisible();

    await claimButton.click();

    await expect(guestPage.getByText("Available: 0 · Yours: 2")).toBeVisible();
    await expect(guestPage.getByText("Claimed: ₺251.00")).toBeVisible();
    await expect(guestPage.getByText("Remaining: ₺0.00")).toBeVisible();
    await expect(guestPage.getByText("Your share: ₺251.00")).toBeVisible();

    const guestCookies = await guestContext.cookies();
    const guestSessionCookie = guestCookies.find(
      (cookie) => cookie.name === GUEST_SESSION_COOKIE_NAME,
    );

    expect(guestSessionCookie).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: guestTablePath!,
    });

    const staffCookies = await staffContext.cookies();

    expect(
      staffCookies.some((cookie) => cookie.name === GUEST_SESSION_COOKIE_NAME),
    ).toBe(false);
    const correctionQuantity = restaurantSection.getByLabel(
      "Quantity for E2E Shared Breakfast",
    );

    await correctionQuantity.fill("1");

    await restaurantSection
      .getByRole("button", { name: "Update quantity" })
      .click();

    await expect(
      restaurantSection.getByText(
        "Quantity cannot be lower than the number of claimed units.",
      ),
    ).toBeVisible();

    await expect(
      restaurantSection.getByText("2 × E2E Shared Breakfast at ₺125.50"),
    ).toBeVisible();
    await expect(correctionQuantity).toHaveValue("2");
    await expect(restaurantSection.getByText("Total: ₺251.00")).toBeVisible();

    await guestPage
      .getByRole("button", {
        name: "Release one E2E Shared Breakfast",
      })
      .click();

    await expect(guestPage.getByText("Available: 1 · Yours: 1")).toBeVisible();
    await expect(guestPage.getByText("Your share: ₺125.50")).toBeVisible();

    await correctionQuantity.fill("3");

    await restaurantSection
      .getByRole("button", { name: "Update quantity" })
      .click();

    await expect(
      restaurantSection.getByText("Bill item quantity updated."),
    ).toBeVisible();

    await expect(
      restaurantSection.getByText("3 × E2E Shared Breakfast at ₺125.50"),
    ).toBeVisible();

    await expect(correctionQuantity).toHaveValue("3");
    await expect(restaurantSection.getByText("Total: ₺376.50")).toBeVisible();

    await guestPage.reload();

    await expect(guestPage.getByText("3 × E2E Shared Breakfast")).toBeVisible();
    await expect(guestPage.getByText("Available: 2 · Yours: 1")).toBeVisible();
    await expect(guestPage.getByText("Bill total: ₺376.50")).toBeVisible();
    await expect(guestPage.getByText("Claimed: ₺125.50")).toBeVisible();
    await expect(guestPage.getByText("Remaining: ₺251.00")).toBeVisible();
    await expect(guestPage.getByText("Your share: ₺125.50")).toBeVisible();

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        "Remove E2E Shared Breakfast from this bill?",
      );

      await dialog.dismiss();
    });

    await restaurantSection
      .getByRole("button", { name: "Remove item" })
      .click();

    await expect(
      restaurantSection.getByText("3 × E2E Shared Breakfast at ₺125.50"),
    ).toBeVisible();

    await expect(restaurantSection.getByText("Total: ₺376.50")).toBeVisible();

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        "Remove E2E Shared Breakfast from this bill?",
      );

      await dialog.accept();
    });

    await restaurantSection
      .getByRole("button", { name: "Remove item" })
      .click();

    await expect(
      restaurantSection.getByText(
        "Release all claimed units before removing this bill item.",
      ),
    ).toBeVisible();

    await expect(
      restaurantSection.getByText("3 × E2E Shared Breakfast at ₺125.50"),
    ).toBeVisible();

    await guestPage
      .getByRole("button", {
        name: "Release one E2E Shared Breakfast",
      })
      .click();

    await expect(guestPage.getByText("Available: 3 · Yours: 0")).toBeVisible();
    await expect(guestPage.getByText("Your share: ₺0.00")).toBeVisible();

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        "Remove E2E Shared Breakfast from this bill?",
      );

      await dialog.accept();
    });

    await restaurantSection
      .getByRole("button", { name: "Remove item" })
      .click();

    await expect(
      restaurantSection.getByText("No bill items yet."),
    ).toBeVisible();
    await expect(restaurantSection.getByText("Total: ₺0.00")).toBeVisible();

    await guestPage.reload();

    await expect(guestPage.getByText("No bill items yet.")).toBeVisible();
    await expect(guestPage.getByText("Bill total: ₺0.00")).toBeVisible();
    await expect(guestPage.getByText("Your share: ₺0.00")).toBeVisible();

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        "Close this bill? Guests will immediately lose access.",
      );

      await dialog.accept();
    });

    await restaurantSection.getByRole("button", { name: "Close bill" }).click();

    await expect(
      restaurantSection.getByText("Table session closed."),
    ).toBeVisible();

    await expect(
      restaurantSection.getByRole("button", { name: "Open bill" }),
    ).toBeVisible();

    await guestPage.reload();

    await expect(
      guestPage.getByRole("heading", { name: "Join table" }),
    ).toBeVisible();

    await expect(
      guestPage.getByText(
        "Your guest access has expired or is unavailable. Enter the current code to join again.",
      ),
    ).toBeVisible();

    await restaurantSection.getByRole("button", { name: "Open bill" }).click();

    const reopenedJoinCodeElement = restaurantSection.getByText(
      /^[0-9A-HJKMNP-TV-Z]{8}$/,
    );

    await expect(reopenedJoinCodeElement).toBeVisible();

    const reopenedJoinCode = await reopenedJoinCodeElement.textContent();

    expect(reopenedJoinCode).not.toBeNull();
    expect(reopenedJoinCode).not.toBe(joinCode);

    await expect(
      restaurantSection.getByText("No bill items yet."),
    ).toBeVisible();

    await guestPage
      .getByLabel("Eight-character join code")
      .fill(reopenedJoinCode!.toLowerCase());

    await guestPage.getByRole("button", { name: "Join table" }).click();

    await expect(
      guestPage.getByRole("heading", {
        name: stage2Fixture.tableName,
      }),
    ).toBeVisible();

    await expect(guestPage.getByText("No bill items yet.")).toBeVisible();

    await expect(guestPage.getByText("Bill total: ₺0.00")).toBeVisible();

    await expect(guestPage.getByText("Your share: ₺0.00")).toBeVisible();
  } finally {
    await staffContext.close();
    await guestContext.close();
  }
});

test("Admin manages a table without changing its guest identity", async ({
  browser,
}) => {
  const staffContext = await browser.newContext();

  try {
    const staffPage = await staffContext.newPage();

    await staffPage.goto("/staff/sign-in");
    await staffPage.getByLabel("Email").fill(stage2Fixture.staffEmail);
    await staffPage.getByLabel("Password").fill(stage2Fixture.staffPassword);
    await staffPage.getByRole("button", { name: "Sign in" }).click();

    await expect(
      staffPage.getByRole("heading", { name: "Staff workspace" }),
    ).toBeVisible();

    const restaurantSection = staffPage
      .getByRole("heading", {
        name: stage2Fixture.restaurantName,
        level: 2,
      })
      .locator("..");

    await restaurantSection
      .getByLabel("New table name")
      .fill(stage2Fixture.managedTableName);

    await restaurantSection
      .getByRole("button", { name: "Create table" })
      .click();

    await expect(restaurantSection.getByText("Table created.")).toBeVisible();

    const managedTable = restaurantSection
      .getByText(stage2Fixture.managedTableName, { exact: true })
      .locator("..");

    await expect(
      managedTable.getByText("Active", { exact: true }),
    ).toBeVisible();

    const originalGuestPath = await managedTable
      .getByRole("link", {
        name: `Open guest page for ${stage2Fixture.managedTableName}`,
      })
      .getAttribute("href");

    expect(originalGuestPath).not.toBeNull();

    await managedTable
      .getByLabel("Table name")
      .fill(stage2Fixture.renamedManagedTableName);

    await managedTable.getByRole("button", { name: "Rename table" }).click();

    const renamedTable = restaurantSection
      .getByText(stage2Fixture.renamedManagedTableName, { exact: true })
      .locator("..");

    await expect(renamedTable.getByText("Table renamed.")).toBeVisible();

    const renamedGuestPath = await renamedTable
      .getByRole("link", {
        name: `Open guest page for ${stage2Fixture.renamedManagedTableName}`,
      })
      .getAttribute("href");

    expect(renamedGuestPath).toBe(originalGuestPath);

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        `Deactivate ${stage2Fixture.renamedManagedTableName}? It cannot open bills until reactivated.`,
      );

      await dialog.accept();
    });

    await renamedTable
      .getByRole("button", { name: "Deactivate table" })
      .click();

    await expect(renamedTable.getByText("Table deactivated.")).toBeVisible();

    await expect(
      renamedTable.getByText("Inactive", { exact: true }),
    ).toBeVisible();

    await expect(
      renamedTable.getByRole("button", { name: "Open bill" }),
    ).toHaveCount(0);

    await expect(
      renamedTable.getByText("Reactivate this table before opening a bill."),
    ).toBeVisible();

    await renamedTable
      .getByRole("button", { name: "Reactivate table" })
      .click();

    await expect(renamedTable.getByText("Table reactivated.")).toBeVisible();

    await expect(
      renamedTable.getByText("Active", { exact: true }),
    ).toBeVisible();

    await renamedTable.getByRole("button", { name: "Open bill" }).click();

    await expect(
      renamedTable.getByText(/^[0-9A-HJKMNP-TV-Z]{8}$/),
    ).toBeVisible();

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        `Deactivate ${stage2Fixture.renamedManagedTableName}? It cannot open bills until reactivated.`,
      );

      await dialog.accept();
    });

    await renamedTable
      .getByRole("button", { name: "Deactivate table" })
      .click();

    await expect(
      renamedTable.getByText(
        "Close the current bill before deactivating this table.",
      ),
    ).toBeVisible();

    await expect(
      renamedTable.getByRole("button", { name: "Close bill" }),
    ).toBeVisible();

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        "Close this bill? Guests will immediately lose access.",
      );

      await dialog.accept();
    });

    await renamedTable.getByRole("button", { name: "Close bill" }).click();

    await expect(renamedTable.getByText("Table session closed.")).toBeVisible();

    staffPage.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(
        `Deactivate ${stage2Fixture.renamedManagedTableName}? It cannot open bills until reactivated.`,
      );

      await dialog.accept();
    });

    await renamedTable
      .getByRole("button", { name: "Deactivate table" })
      .click();

    await expect(
      renamedTable.getByText("Inactive", { exact: true }),
    ).toBeVisible();

    const finalGuestPath = await renamedTable
      .getByRole("link", {
        name: `Open guest page for ${stage2Fixture.renamedManagedTableName}`,
      })
      .getAttribute("href");

    expect(finalGuestPath).toBe(originalGuestPath);
  } finally {
    await staffContext.close();
  }
});
