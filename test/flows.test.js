/**
 * Live against testnut. Never real sats. Fragment hygiene is the load-bearing test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createGift,
  claimGift,
  regift,
  reclaim,
  parseFragment,
  inspectGift,
  sumSats,
  spendableFromWallet,
  reportedClaimFee,
  assertWithinFeeCap,
} from "../src/token.js";
import { Amount } from "@cashu/cashu-ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TEST_SATS = 8;
const intercepted = [];
let originalFetch;

function leakHaystacks(entry) {
  return [entry.url, entry.body, entry.headers].join("\n");
}

beforeAll(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    let body = init.body ?? "";
    if (typeof body !== "string") {
      try {
        body = JSON.stringify(body);
      } catch {
        body = String(body);
      }
    }
    if (!body && input && typeof input === "object" && "clone" in input) {
      try {
        body = await input.clone().text();
      } catch {
        body = "";
      }
    }
    const headers = JSON.stringify(
      init.headers || (input && input.headers) || {},
    );
    intercepted.push({ url: String(url), body: String(body), headers });
    return originalFetch(input, init);
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function assertFragmentHygiene(token, ...secrets) {
  for (const entry of intercepted) {
    expect(entry.url.includes("#"), `fragment on the wire: ${entry.url}`).toBe(
      false,
    );
    const hay = leakHaystacks(entry);
    expect(hay.includes(token), `token leaked to ${entry.url}`).toBe(false);
    for (const secret of secrets) {
      expect(hay.includes(secret), `key leaked to ${entry.url}`).toBe(false);
    }
  }
}

/** Testnut FakeWallet marks paid on the next check, not the create response. */
async function waitPaid(created, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await created.poll()) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("mint quote never paid");
}

describe("SnapSats token flows", () => {
  it(
    "create → claim",
    async () => {
      intercepted.length = 0;
      const created = await createGift(TEST_SATS);
      expect(created.invoice.startsWith("lnbc") || created.invoice.startsWith("lntb") || created.invoice.startsWith("ln")).toBe(true);
      await waitPaid(created);
      const gift = await created.finalize();
      const { token, giftPriv } = parseFragment(gift.link.split("#")[1]);
      const claimed = await claimGift(gift.link.split("#")[1]);
      expect(claimed.amountSats).toBeGreaterThan(0);
      expect(claimed.amountSats).toBeLessThanOrEqual(TEST_SATS);
      assertFragmentHygiene(token, giftPriv, gift.refundKey);
    },
    120_000,
  );

  it(
    "create → expire → reclaim",
    async () => {
      intercepted.length = 0;
      const created = await createGift(TEST_SATS, { lockSeconds: 2 });
      await waitPaid(created);
      const gift = await created.finalize();
      const { token, giftPriv } = parseFragment(gift.link.split("#")[1]);
      const waitMs = Math.max(0, gift.locktime * 1000 - Date.now()) + 2000;
      await new Promise((r) => setTimeout(r, waitMs));
      const result = await reclaim(gift.refundKey, gift.lockedProofs);
      expect(result.alreadyClaimed).toBe(false);
      expect(sumSats(result.proofs)).toBeGreaterThan(0);
      assertFragmentHygiene(token, giftPriv, gift.refundKey);
    },
    120_000,
  );

  it(
    "claim → pass-some-on keeps change",
    async () => {
      intercepted.length = 0;
      const created = await createGift(16);
      await waitPaid(created);
      const gift = await created.finalize();
      const claimed = await claimGift(gift.link.split("#")[1]);
      const passAmount = Math.max(1, Math.floor(claimed.amountSats / 2));
      const passed = await regift(claimed.proofs, passAmount);
      expect(passed.amountSats).toBeGreaterThan(0);
      expect(passed.amountSats).toBeLessThanOrEqual(claimed.amountSats);
      const changeSats = sumSats(passed.change);
      expect(changeSats + passed.amountSats).toBeLessThanOrEqual(
        claimed.amountSats,
      );
      const { token, giftPriv } = parseFragment(passed.link.split("#")[1]);
      assertFragmentHygiene(token, giftPriv, passed.refundKey);
    },
    120_000,
  );

  it(
    "already-claimed reclaim reports honestly",
    async () => {
      const created = await createGift(TEST_SATS);
      await waitPaid(created);
      const gift = await created.finalize();
      await claimGift(gift.link.split("#")[1]);
      const result = await reclaim(gift.refundKey, gift.lockedProofs);
      expect(result.alreadyClaimed).toBe(true);
      expect(result.proofs).toEqual([]);
    },
    120_000,
  );

  it("inspectGift is local and rejects a non-gift fragment", () => {
    expect(() => inspectGift("not-a-gift")).toThrow(/not a SnapSats gift/);
  });

  it(
    "nonzero-fee keyset: claim reports fee, picker caps, regift-at-max",
    async () => {
      expect(reportedClaimFee(16, 16, 2)).toBe(2);
      expect(reportedClaimFee(16, 14, 0)).toBe(2);
      const created = await createGift(16);
      await waitPaid(created);
      const gift = await created.finalize();
      const claimed = await claimGift(gift.link.split("#")[1]);
      const fakeKeyset = {
        getFeesForProofs: () => Amount.from(2),
        maxSpendableAfterFees: (proofs) =>
          Amount.from(Math.max(0, sumSats(proofs) - 2)),
      };
      const cap = spendableFromWallet(fakeKeyset, claimed.proofs);
      expect(cap.feeSats).toBe(2);
      expect(cap.maxSats).toBe(claimed.amountSats - 2);
      expect(cap.maxSats).toBeLessThan(cap.balanceSats);
      expect(() => assertWithinFeeCap(cap.balanceSats, cap.maxSats)).toThrow(
        /fees/,
      );
      const passed = await regift(claimed.proofs, cap.maxSats);
      expect(passed.amountSats).toBeGreaterThan(0);
      expect(passed.amountSats).toBeLessThanOrEqual(cap.maxSats);
    },
    120_000,
  );

  it("preview metadata is static, absolute, and fragment-free", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    expect(html).toContain("<title>SnapSats — bitcoin you can text</title>");
    expect(html).toContain('property="og:title" content="A bitcoin gift 🎁"');
    expect(html).toContain(
      'property="og:description" content="Tap to open it. No app needed."',
    );
    expect(html).toContain('property="og:site_name" content="SnapSats"');
    expect(html).toContain('property="og:url" content="https://snapsats.app"');
    expect(html).toContain(
      'property="og:image" content="https://snapsats.app/og.png"',
    );
    expect(html).not.toMatch(/property="og:image" content="\.\//);
    expect(html).not.toMatch(/property="og:image" content="\//);
    expect(html.includes("#cashu")).toBe(false);
    expect(html.includes("~")).toBe(false);
    for (const entry of intercepted) {
      expect(new URL(entry.url, "https://snapsats.app").hash).toBe("");
    }
  });
});
