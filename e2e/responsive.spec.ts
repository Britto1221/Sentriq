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

test("login and recovery routes have no serious automated WCAG 2.2 AA findings", async ({ page }) => {
  for (const route of ["/login", "/recover"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), route).toEqual([]);
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
