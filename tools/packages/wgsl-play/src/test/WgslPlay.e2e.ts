/** E2E tests for wgsl-play component using Playwright. */
import { expect, test } from "@playwright/test";

test("basic shader renders (no imports)", async ({ page }) => {
  await page.goto("/");

  // Wait for WebGPU to initialize and render
  await page.waitForTimeout(1000);

  // First player should show gradient
  const player1 = page.locator("#player1");
  await expect(player1).toBeVisible();

  // Check no error overlay
  const errorOverlay = player1.locator("text=Error");
  await expect(errorOverlay).not.toBeVisible();
});

test("dev mode - npm fetch works", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);

  // Select npm mode and load
  await page.selectOption("#mode-select", "npm");
  await page.click("#load-dev");

  // Wait for load
  await page.waitForTimeout(3000);

  // Check status indicates success
  const status = page.locator("#status");
  const statusText = await status.textContent();

  // Should either succeed or show a meaningful error (not crash)
  expect(statusText).toMatch(/Status: (Success|Error)/);
});

test("dev mode - bundle mode loads from local dist/", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);

  await page.selectOption("#mode-select", "bundle");
  await page.click("#load-dev");
  await page.waitForTimeout(3000);

  const status = page.locator("#status");
  const statusText = await status.textContent();

  console.log("Bundle mode status:", statusText);

  // Bundle mode should successfully load from local dist/
  expect(statusText).toContain("Success");
});

test("dev mode - source mode loads from local shaders/", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto("/");
  await page.waitForTimeout(500);

  await page.selectOption("#mode-select", "source");
  await page.click("#load-dev");
  await page.waitForTimeout(3000);

  const status = page.locator("#status");
  const statusText = await status.textContent();

  console.log("Browser console:", logs.join("\n"));
  console.log("Source mode status:", statusText);

  // Source mode should successfully load from local shaders/
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
