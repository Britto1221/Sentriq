import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing and login routes load with a clear page heading", async ({ page }) => {
  for (const route of ["/", "/login", "/recover"]) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} response`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
});

test("landing route has no serious automated WCAG 2.2 AA findings", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description }))).toEqual([]);
});

test("mobile sign-in and create-account actions are aligned and separated", async ({ page }) => {
  for (const width of [320, 390, 471, 620]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const authLinks = page.locator(".header-auth-links");
    await expect(authLinks).toBeVisible({ timeout: 15_000 });
    const actions = authLinks.locator(":scope > a");
    await expect(actions).toHaveCount(2);
    const [signIn, createAccount] = await actions.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      }),
    );
    expect(Math.abs((signIn.top + signIn.bottom) - (createAccount.top + createAccount.bottom)), `vertical alignment at ${width}px`).toBeLessThanOrEqual(2);
    expect(createAccount.left - signIn.right, `touch spacing at ${width}px`).toBeGreaterThanOrEqual(8);
    expect(createAccount.right, `action bounds at ${width}px`).toBeLessThanOrEqual(width);
    if (width === 471) {
      await page.setViewportSize({ width, height: 503 });
      const overlap = await page.evaluate(() => {
        const launcher = document.querySelector<HTMLElement>(".assistant-launcher")?.getBoundingClientRect();
        const primary = document.querySelector<HTMLElement>("main .landing-actions .button-primary")?.getBoundingClientRect();
        return Boolean(launcher && primary && launcher.left < primary.right && launcher.right > primary.left && launcher.top < primary.bottom && launcher.bottom > primary.top);
      });
      expect(overlap, "help launcher must not cover the primary landing action at 471×503").toBe(false);
      await page.screenshot({ path: ".artifacts/playwright/northstar-header-mobile-471.png" });
    }
  }
});

test("login and recovery routes have no serious automated WCAG 2.2 AA findings", async ({ page }) => {
  for (const route of ["/login", "/recover"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), route).toEqual([]);
  }
});

test("Sentriq Assistant remains usable and has no automated WCAG findings on mobile", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await page.getByRole("button", { name: "Need help signing in?" }).click();
    const panel = page.locator("#sentriq-assistant-panel");
    await expect(panel).toBeVisible();
    const geometry = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewport: window.innerWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.width).toBeLessThanOrEqual(width);
    const violations = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(violations.violations.map(({ id, impact }) => ({ id, impact })), `assistant at ${width}px`).toEqual([]);
    await page.getByRole("button", { name: "Close Sentriq Assistant" }).click();
  }
});

test("keyboard focus starts on a visible interactive control on auth routes", async ({ page }) => {
  for (const route of ["/login", "/recover"]) {
    await page.goto(route);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        visible: rect.width > 0 && rect.height > 0,
        outline: getComputedStyle(element).outlineStyle,
        shadow: getComputedStyle(element).boxShadow,
      };
    });
    expect(focused?.tag, `${route} first focus target`).toMatch(/^(A|BUTTON|INPUT|SUMMARY)$/);
    expect(focused?.visible, `${route} first focus visibility`).toBe(true);
    expect(focused?.outline !== "none" || focused?.shadow !== "none", `${route} focus indicator`).toBe(true);
  }
});

for (const width of [320, 360, 375, 390, 428, 768, 1024, 1280, 1440, 1920]) {
  test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/login", "/recover"]) {
      await page.goto(route);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth, `${route} document width at viewport ${width}px`).toBeLessThanOrEqual(width);
    }
  });
}
