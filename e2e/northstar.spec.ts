import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ screenshot: "off", video: "off", trace: "off" });

async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  return { cdp, authenticatorId };
}

async function registerWithPasskey(page: Page, email: string): Promise<string[]> {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Development only: show the local email code", exact: true }).click();
  const emailCode = page.getByLabel("Email verification code", { exact: true });
  await expect(emailCode).toHaveValue(/^[A-Za-z0-9_-]{12}$/, { timeout: 15_000 });
  const code = await emailCode.inputValue();
  expect(code).toMatch(/^[A-Za-z0-9_-]{12}$/);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Create your passkey" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Create passkey", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible({ timeout: 15_000 });
  const codes = await page.locator(".recovery-code-grid code").allTextContents();
  expect(codes).toHaveLength(6);
  expect(new Set(codes).size).toBe(6);
  expect(codes.every((value) => /^[A-Za-z0-9_-]{32}$/.test(value))).toBe(true);
  await page.getByLabel("I saved these codes somewhere secure. I understand they are shown only once.", { exact: true }).check();
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account is ready" })).toBeVisible();
  await page.getByRole("button", { name: "Go to your account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  return codes;
}

async function loginWithPasskey(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Sign in with a passkey", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}

async function startDeviceLink(page: Page, email: string): Promise<string> {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Approve using my existing device", exact: true }).click();
  const code = await page.locator(".device-link-code").last().textContent();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code!;
}

function waitForSessionCheck(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/auth/session" && response.request().method() === "GET";
  });
}

test("the recovery guide is local, bilingual, and does not render secret input", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/") && path !== "/api/auth/session") apiRequests.push(`${request.method()} ${path}`);
  });
  const sessionCheck = waitForSessionCheck(page);
  await page.goto("/recover");
  await sessionCheck;
  await expect(page.getByText("Checking session…", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Rule-based guidance · no AI model is connected/i)).toBeVisible();
  apiRequests.length = 0;
  await page.screenshot({ path: ".artifacts/visual-review/recovery-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".artifacts/visual-review/recovery-mobile.png", fullPage: true });
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  await page.setViewportSize({ width: 1280, height: 900 });

  const question = page.locator("#recovery-guide-question");
  await question.fill("I lost my phone yesterday");
  await page.getByRole("button", { name: "Get guidance", exact: true }).click();
  await expect(page.getByText(/First check whether another device can use a passkey/i)).toBeVisible();
  await expect(page.getByText("I lost my phone yesterday", { exact: true })).toHaveCount(0);

  const secret = "aBcdEF0123456789_XyZ9876543210ab";
  await question.fill(secret);
  await page.getByRole("button", { name: "Get guidance", exact: true }).click();
  await expect(page.getByText(/Do not share passwords, recovery codes, or one-time codes in chat/i)).toBeVisible();
  await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
  await page.locator("#recovery-language").selectOption("ta");
  await expect(page.locator("html")).toHaveAttribute("lang", "ta");
  await question.fill("என்னிடம் மீட்பு குறியீடு உள்ளது");
  await page.getByRole("button", { name: "வழிகாட்டலைப் பெறு", exact: true }).click();
  await expect(page.getByText(/குறியீட்டை இங்கே ஒட்ட வேண்டாம்/)).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("verified email registration, passwordless login, and server-enforced Shield export", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@northstar.test`;
  const { cdp } = await addVirtualAuthenticator(page);
  await registerWithPasskey(page, email);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginWithPasskey(page, email);

  await page.goto("/settings/export");
  const directExportStatus = await page.evaluate(async () => (await fetch("/api/protected/export", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format: "json" }),
  })).status);
  expect(directExportStatus).toBe(428);
  await page.getByRole("button", { name: "Request protected export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("northstar-account-export.json");
  await expect(page.getByText("Your export request was accepted. Check this page for status.", { exact: true })).toBeVisible();

  const replayStatus = await page.evaluate(async () => (await fetch("/api/protected/export", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format: "json" }),
  })).status);
  expect(replayStatus).toBe(428);
  await cdp.detach();
});

test("a used recovery code cannot be replayed and recovery does not create a session", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `reclaim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@northstar.test`;
  const oldDevice = await addVirtualAuthenticator(page);
  const [recoveryCode] = await registerWithPasskey(page, email);
  expect(recoveryCode).toBeTruthy();

  await page.goto("/recover");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Begin recovery", exact: true }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(recoveryCode!);
  await page.getByRole("button", { name: "Verify recovery code", exact: true }).click();
  await oldDevice.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: oldDevice.authenticatorId });
  const replacementDevice = await addVirtualAuthenticator(page);
  await page.getByRole("button", { name: "Register replacement passkey", exact: true }).click();
  await expect(page.locator(".recovery-code-grid code")).toHaveCount(6, { timeout: 20_000 });
  await expect.poll(async () => await page.evaluate(async () => (await fetch("/api/auth/session", { cache: "no-store" })).status)).toBe(401);

  await page.reload();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Begin recovery", exact: true }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(recoveryCode!);
  await page.getByRole("button", { name: "Verify recovery code", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await replacementDevice.cdp.detach();
});

test("Device Link requires existing-device approval and a new browser-bound passkey", async ({ page, browser }: { page: Page; browser: Browser }) => {
  test.setTimeout(150_000);
  const email = `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@northstar.test`;
  const oldPhone = await addVirtualAuthenticator(page);
  await registerWithPasskey(page, email);

  const newContext = await browser.newContext();
  const newPage = await newContext.newPage();
  const newPhone = await addVirtualAuthenticator(newPage);
  const requestCode = await startDeviceLink(newPage, email);

  const sessionCheck = waitForSessionCheck(page);
  await page.goto("/settings/security");
  await sessionCheck;
  await expect(page.getByText("Checking session…", { exact: true })).toHaveCount(0);
  const request = page.locator(".device-approval-request");
  await expect(request).toBeVisible({ timeout: 20_000 });
  await expect(request.locator(".device-link-code")).toHaveText(requestCode);
  await request.getByRole("checkbox").check();
  await request.getByRole("button", { name: "Verify and approve", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "The new device is approved." })).toBeVisible();

  await expect(newPage.getByRole("button", { name: "Create passkey on this device", exact: true })).toBeVisible({ timeout: 20_000 });
  await newPage.getByRole("button", { name: "Create passkey on this device", exact: true }).click();
  await expect(newPage).toHaveURL(/\/dashboard$/);
  await expect(newPage.getByText(email, { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/auth/session", { cache: "no-store" })).status)).toBe(200);

  const credentials = await newPhone.cdp.send("WebAuthn.getCredentials", { authenticatorId: newPhone.authenticatorId });
  expect(credentials.credentials).toHaveLength(1);

  const managementSessionCheck = waitForSessionCheck(page);
  await page.goto("/settings/security");
  await managementSessionCheck;
  await expect(page.getByText("Checking session…", { exact: true })).toHaveCount(0);
  const passkeys = page.locator(".passkey-card");
  await expect(passkeys).toHaveCount(2);
  await page.screenshot({ path: ".artifacts/visual-review/passkeys-security-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".artifacts/visual-review/passkeys-security-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await passkeys.first().getByRole("button", { name: "Remove passkey", exact: true }).click();
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await expect(passkeys).toHaveCount(1);
  expect(await page.evaluate(async () => (await fetch("/api/auth/session", { cache: "no-store" })).status)).toBe(200);

  await newPage.getByRole("button", { name: "Sign out", exact: true }).click();
  await loginWithPasskey(newPage, email);

  await oldPhone.cdp.detach();
  await newPhone.cdp.detach();
  await newContext.close();
});
