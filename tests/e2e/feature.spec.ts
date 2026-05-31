import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

// Read the QR payload one peer publishes (same string a camera would decode).
async function payloadOf(page: import("@playwright/test").Page): Promise<string> {
  await page.locator(".mesh-qrx-payload summary").click();
  return (await page.locator(".mesh-qrx-payload code").textContent()) ?? "";
}

async function scan(page: import("@playwright/test").Page, payload: string) {
  await page.getByPlaceholder("or paste a payload (URL or mesh://)").fill(payload);
  await page.getByRole("button", { name: "use", exact: true }).click();
}

async function fillProfile(
  page: import("@playwright/test").Page,
  name: string,
  teach: string,
  learn: string,
) {
  await page.getByPlaceholder("your name").fill(name);
  await page.getByPlaceholder("i can teach (comma-separated)").fill(teach);
  await page.getByPlaceholder("i want to learn (comma-separated)").fill(learn);
}

test("complementary teach/learn match surfaces on BOTH peers' screens", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // A teaches rust, wants kayaking. B teaches kayaking, wants rust → mutual.
    await fillProfile(a, "alice", "rust, baking", "kayaking");
    await fillProfile(b, "bob", "kayaking", "rust");

    // A's screen: B surfaces with the complementary tags.
    await expect(a.locator(".ss-matches")).toContainText("bob");
    await expect(a.locator(".ss-matches")).toContainText("kayaking"); // they teach me
    await expect(a.locator(".ss-matches")).toContainText("rust"); // i teach them
    await expect(a.locator(".ss-mutual").first()).toBeVisible();

    // B's screen (the OPPOSITE peer): A surfaces with the mirror-image tags.
    // This is the load-bearing cross-peer assertion the old test omitted.
    await expect(b.locator(".ss-matches")).toContainText("alice");
    await expect(b.locator(".ss-matches")).toContainText("rust"); // they teach me
    await expect(b.locator(".ss-matches")).toContainText("kayaking"); // i teach them
    await expect(b.locator(".ss-mutual").first()).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("scanning a peer's QR marks them connected on BOTH screens", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await fillProfile(a, "alice", "rust", "kayaking");
    await fillProfile(b, "bob", "kayaking", "rust");

    await expect(a.locator(".ss-matches")).toContainText("bob");
    await expect(b.locator(".ss-matches")).toContainText("alice");

    // Before any scan, neither side is "connected via QR".
    await expect(a.locator(".ss-qr-status")).toHaveCount(0);
    await expect(b.locator(".ss-qr-status")).toHaveCount(0);

    // A scans B's QR — the advertised "via QR" action.
    await scan(a, await payloadOf(b));

    // The connection is shared state, so it surfaces on BOTH peers' match
    // cards — not just on the scanner's screen.
    await expect(a.locator(".ss-matches .ss-qr-status")).toContainText("connected via QR");
    await expect(b.locator(".ss-matches .ss-qr-status")).toContainText("connected via QR");
  } finally {
    await cleanup();
  }
});
