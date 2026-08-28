import { expect, test } from "@playwright/test";

test("loads DENK application", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Create Next App/);
  await expect(page.getByRole("main")).toBeVisible();
});
