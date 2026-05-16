import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("A teaches what B wants — both sides see a mutual match", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await a.getByPlaceholder("i can teach (comma-separated)").fill("rust, baking");
    await a.getByPlaceholder("i want to learn (comma-separated)").fill("kayaking");

    await b.getByPlaceholder("your name").fill("bob");
    await b.getByPlaceholder("i can teach (comma-separated)").fill("kayaking");
    await b.getByPlaceholder("i want to learn (comma-separated)").fill("rust");

    await expect(a.locator(".ss-matches")).toContainText("bob");
    await expect(a.locator(".ss-matches")).toContainText("kayaking");
    await expect(a.locator(".ss-mutual").first()).toBeVisible();
  } finally {
    await cleanup();
  }
});
