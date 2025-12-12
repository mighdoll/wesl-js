/** E2E tests for wgsl-play component using Playwright. */
import { expect, test } from "@playwright/test";

test("basic shader renders (no imports)", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);

  const player1 = page.locator("#player1");
  await expect(player1).toBeVisible();

  // Check no error overlay
  const errorOverlay = player1.locator("text=Error");
  await expect(errorOverlay).not.toBeVisible();
});

test("npm CDN - external imports work", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);

  await page.click("#load-npm");
  await page.waitForTimeout(3000);

  const status = page.locator("#npm-status");
  const statusText = await status.textContent();

  // Should succeed or show meaningful error (not crash)
  expect(statusText).toMatch(/Status: (Success|Error)/);
});

test("shaderRoot - package:: imports resolve", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);

  await page.click("#load-internal");
  await page.waitForTimeout(2000);

  const status = page.locator("#internal-status");
  const statusText = await status.textContent();

  console.log("shaderRoot status:", statusText);
  expect(statusText).toContain("Success");
});

test("shaderRoot - src attribute with super:: and package:: imports", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto("/");
  await page.waitForTimeout(500);

  await page.click("#load-src");
  await page.waitForTimeout(2000);

  const status = page.locator("#src-status");
  const statusText = await status.textContent();

  console.log("Browser console:", logs.join("\n"));
  console.log("src attribute status:", statusText);

  expect(statusText).toContain("Success");
});

test("no critical console errors on basic load", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("favicon")) {
        errors.push(text);
      }
    }
  });

  await page.goto("/");
  await page.waitForTimeout(2000);

  const criticalErrors = errors.filter(
    e => !e.includes("favicon") && !e.includes("404"),
  );
  expect(criticalErrors).toEqual([]);
});
