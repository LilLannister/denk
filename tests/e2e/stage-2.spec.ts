import { expect, test } from "@playwright/test";

import { stage2Fixture } from "./stage-2-fixture";

import { GUEST_SESSION_COOKIE_NAME } from "../../src/lib/guest-session-cookie";

test("staff opens and populates a bill that an anonymous guest joins and views", async ({
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
    await expect(guestPage.getByText("Total: ₺251.00")).toBeVisible();

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
  } finally {
    await staffContext.close();
    await guestContext.close();
  }
});
