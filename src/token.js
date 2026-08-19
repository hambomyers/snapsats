/**
 * Cashu wrapper. One mint, one locktime, no melt. The fragment is assembled
 * here and must never be passed to fetch — only proof payloads go to the mint.
 */
import {
  Wallet,
  MintQuoteState,
  P2PKBuilder,
  getEncodedToken,
  getTokenMetadata,
  normalizeMintUrl,
  Amount,
  CheckStateEnum,
} from "@cashu/cashu-ts";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ACTIVE_MINT } from "./mints.js";

export const SITE = "https://snapsats.app";
export const LOCKTIME_SECONDS = 24 * 60 * 60;

let walletPromise = null;

export async function getWallet() {
  if (!walletPromise) {
    const wallet = new Wallet(ACTIVE_MINT);
    walletPromise = wallet.loadMint().then(() => wallet);
  }
  return walletPromise;
}

function makeKeypair() {
  const { secretKey, publicKey } = secp256k1.keygen();
  return { priv: bytesToHex(secretKey), pub: bytesToHex(publicKey) };
}

export function sumSats(proofs) {
  return proofs.reduce((n, p) => n + Amount.from(p.amount).toNumber(), 0);
}

export function serializeProofs(proofs) {
  return proofs.map((p) => ({
    id: p.id,
    amount: Amount.from(p.amount).toNumber(),
    secret: p.secret,
    C: p.C,
    ...(p.dleq ? { dleq: p.dleq } : {}),
    ...(p.witness ? { witness: p.witness } : {}),
  }));
}

export function parseFragment(fragment) {
  const raw = String(fragment || "").replace(/^#/, "");
  const i = raw.lastIndexOf("~");
  if (i < 1) throw new Error("This link is not a SnapSats gift.");
  const token = raw.slice(0, i);
  const giftPriv = raw.slice(i + 1);
  if (!token.startsWith("cashu") || !/^[0-9a-fA-F]+$/.test(giftPriv)) {
    throw new Error("This link is not a SnapSats gift.");
  }
  return { token, giftPriv };
}

export function buildLink(token, giftPriv) {
  return `${SITE}/#${token}~${giftPriv}`;
}

function locktimeFromSecrets(proofs) {
  for (const p of proofs) {
    try {
      const secret = JSON.parse(p.secret);
      if (secret?.[0] !== "P2PK") continue;
      const tag = (secret[1]?.tags || []).find((t) => t[0] === "locktime");
      if (tag) return Number(tag[1]);
    } catch {
      /* not a well-known secret */
    }
  }
  return null;
}

/** Local-only inspect. Does not talk to the mint. */
export function inspectGift(fragment) {
  const { token, giftPriv } = parseFragment(fragment);
  const meta = getTokenMetadata(token);
  const mint = normalizeMintUrl(meta.mint);
  if (mint !== normalizeMintUrl(ACTIVE_MINT)) {
    throw new Error("This gift is from a mint SnapSats does not use.");
  }
  return {
    token,
    giftPriv,
    amountSats: meta.amount.toNumber(),
    mint,
    locktime: locktimeFromSecrets(meta.incompleteProofs || []),
  };
}

async function lockProofs(wallet, proofs, lockSeconds) {
  const gift = makeKeypair();
  const refund = makeKeypair();
  const locktime = Math.floor(Date.now() / 1000) + lockSeconds;
  const p2pk = new P2PKBuilder()
    .addLockPubkey(gift.pub)
    .lockUntil(locktime)
    .addRefundPubkey(refund.pub)
    .toOptions();
  // receive-as-P2PK, not send+includeFees: we have no extra proofs to cover the next swap.
  const lockedProofs = await wallet.ops.receive(proofs).asP2PK(p2pk).run();
  const token = getEncodedToken({
    mint: ACTIVE_MINT,
    proofs: lockedProofs,
    unit: "sat",
  });
  return {
    link: buildLink(token, gift.priv),
    refundKey: refund.priv,
    lockedProofs: serializeProofs(lockedProofs),
    locktime,
    change: [],
    amountSats: sumSats(lockedProofs),
    token,
  };
}

export async function createGift(amountSats, opts = {}) {
  const lockSeconds = opts.lockSeconds ?? LOCKTIME_SECONDS;
  const wallet = await getWallet();
  const quote = await wallet.createMintQuoteBolt11(amountSats);
  return {
    invoice: quote.request,
    quoteId: quote.quote,
    async poll() {
      const checked = await wallet.checkMintQuoteBolt11(quote.quote);
      return (
        checked.state === MintQuoteState.PAID ||
        checked.state === MintQuoteState.ISSUED
      );
    },
    async finalize() {
      const paid = await wallet.checkMintQuoteBolt11(quote.quote);
      if (
        paid.state !== MintQuoteState.PAID &&
        paid.state !== MintQuoteState.ISSUED
      ) {
        throw new Error("The invoice has not been paid yet.");
      }
      const proofs = await wallet.ops.mintBolt11(amountSats, quote.quote).run();
      const gift = await lockProofs(wallet, proofs, lockSeconds);
      return gift;
    },
  };
}

function feeSatsForProofs(wallet, proofs) {
  try {
    return wallet.getFeesForProofs(proofs).toNumber();
  } catch {
    return 0;
  }
}

function maxSpendableSats(wallet, proofs) {
  try {
    return wallet.maxSpendableAfterFees(proofs).toNumber();
  } catch {
    return sumSats(proofs);
  }
}

export function reportedClaimFee(faceSats, receivedSats, nextFeeSats = 0) {
  return Math.max(0, faceSats - receivedSats, nextFeeSats);
}

export function assertWithinFeeCap(amountSats, maxSats) {
  if (amountSats > maxSats) {
    throw new Error("Amount exceeds what remains after mint fees.");
  }
}

/** Balance, mint input fee, and the largest amount a regift can lock. */
export function spendableFromWallet(wallet, proofs) {
  const balanceSats = sumSats(proofs);
  return {
    balanceSats,
    feeSats: feeSatsForProofs(wallet, proofs),
    maxSats: maxSpendableSats(wallet, proofs),
  };
}

export async function spendableSats(proofs) {
  return spendableFromWallet(await getWallet(), proofs);
}

export async function claimGift(fragment) {
  const { token, giftPriv } = parseFragment(fragment);
  const meta = inspectGift(fragment);
  const wallet = await getWallet();
  const proofs = await wallet.ops.receive(token).privkey(giftPriv).run();
  const serialized = serializeProofs(proofs);
  const amountSats = sumSats(serialized);
  return {
    proofs: serialized,
    amountSats,
    feeSats: reportedClaimFee(
      meta.amountSats,
      amountSats,
      feeSatsForProofs(wallet, serialized),
    ),
  };
}

export async function regift(proofs, amountSats, opts = {}) {
  const lockSeconds = opts.lockSeconds ?? LOCKTIME_SECONDS;
  const wallet = await getWallet();
  const maxSats = maxSpendableSats(wallet, proofs);
  assertWithinFeeCap(amountSats, maxSats);
  const gift = makeKeypair();
  const refund = makeKeypair();
  const locktime = Math.floor(Date.now() / 1000) + lockSeconds;
  const p2pk = new P2PKBuilder()
    .addLockPubkey(gift.pub)
    .lockUntil(locktime)
    .addRefundPubkey(refund.pub)
    .toOptions();
  const { keep, send } = await wallet.ops
    .send(amountSats, proofs)
    .asP2PK(p2pk)
    .keepAsRandom()
    .run();
  const token = getEncodedToken({
    mint: ACTIVE_MINT,
    proofs: send,
    unit: "sat",
  });
  return {
    link: buildLink(token, gift.priv),
    refundKey: refund.priv,
    lockedProofs: serializeProofs(send),
    locktime,
    change: serializeProofs(keep),
    amountSats: sumSats(send),
    feeSats: Math.max(0, sumSats(proofs) - sumSats(send) - sumSats(keep)),
    token,
  };
}

export async function reclaim(refundKey, lockedProofs) {
  const wallet = await getWallet();
  const states = await wallet.checkProofsStates(lockedProofs);
  if (states.every((s) => s.state === CheckStateEnum.SPENT)) {
    return { alreadyClaimed: true, proofs: [] };
  }
  try {
    const proofs = await wallet.ops
      .receive(lockedProofs)
      .privkey(refundKey)
      .run();
    return { alreadyClaimed: false, proofs: serializeProofs(proofs) };
  } catch (err) {
    const again = await wallet.checkProofsStates(lockedProofs);
    if (again.some((s) => s.state === CheckStateEnum.SPENT)) {
      return { alreadyClaimed: true, proofs: [] };
    }
    throw err;
  }
}
