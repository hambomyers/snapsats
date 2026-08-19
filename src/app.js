/**
 * One render(state), one machine. No router. The fragment picks CLAIM vs SEND.
 */
import { renderSVG } from "uqr";
import { getEncodedToken } from "@cashu/cashu-ts";
import { ACTIVE_MINT } from "./mints.js";
import * as token from "./token.js";
import * as store from "./store.js";

const USD_AMOUNTS = [5, 10, 25, 50];
const FALLBACK_SATS = [5000, 10000, 25000, 50000];
const PRICE_URL = "https://mempool.space/api/v1/prices";

let state = { name: "boot" };
let usdPerBtc = null;
let priceTried = false;
let tickId = 0;
let lastAnnouncedMinute = null;

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function qrSvg(text) {
  return renderSVG(text, {
    pixelSize: 4,
    border: 2,
    whiteColor: "#FAFAF8",
    blackColor: "#17181C",
  });
}

function formatSats(n) {
  return `${Number(n).toLocaleString()} sats`;
}

function approxUsd(sats) {
  if (!usdPerBtc) return "";
  const usd = (sats / 1e8) * usdPerBtc;
  const shown = usd >= 10 ? Math.round(usd) : Math.round(usd * 100) / 100;
  return `(~$${shown} right now)`;
}

function usdHeadline(sats) {
  if (!usdPerBtc) return `${formatSats(sats)} in bitcoin`;
  const usd = (sats / 1e8) * usdPerBtc;
  const shown = usd >= 1 ? Math.round(usd) : usd.toFixed(2);
  return `$${shown} in bitcoin`;
}

function remainingHMS(locktime) {
  const s = Math.max(0, locktime - Math.floor(Date.now() / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function untilPhrase(locktime) {
  const d = new Date(locktime * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `${time} today`;
  if (d.toDateString() === tomorrow.toDateString()) return `${time} tomorrow`;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function loadPrice() {
  if (priceTried) return usdPerBtc;
  priceTried = true;
  try {
    const res = await fetch(PRICE_URL);
    if (!res.ok) return null;
    const data = await res.json();
    const n = Number(data.USD);
    if (!Number.isFinite(n) || n <= 0) return null;
    usdPerBtc = n;
  } catch {
    usdPerBtc = null;
  }
  return usdPerBtc;
}

function satsFromUsd(usd) {
  if (!usdPerBtc) return null;
  return Math.max(1, Math.round((usd / usdPerBtc) * 1e8));
}

function setState(next) {
  state = next;
  render();
}

function view() {
  switch (state.name) {
    case "teaser":
      return viewTeaser();
    case "opening":
      return `<p class="glyph" aria-hidden="true">🎁</p><p class="body">${esc(state.message || "Opening the gift…")}</p>`;
    case "owned":
      return viewOwned();
    case "keep":
      return viewKeep();
    case "wallet":
      return viewWallet();
    case "pass":
      return viewPass();
    case "link":
      return viewLink();
    case "pick":
      return viewPick();
    case "invoice":
      return viewInvoice();
    case "error":
      return viewError();
    default:
      return `<p class="body">Loading…</p>`;
  }
}

function viewTeaser() {
  const expired = state.locktime && Date.now() / 1000 > state.locktime;
  const countdown = state.locktime
    ? `<p class="display live" aria-hidden="true">${remainingHMS(state.locktime)}</p>`
    : "";
  const line = expired
    ? `this was yours until ${untilPhrase(state.locktime)} — it may still open, or the sender may have taken it back`
    : state.locktime
      ? `yours until ${untilPhrase(state.locktime)} — after that the sender can take it back`
      : "";
  const live = state.locktime
    ? `<p class="sr-only" aria-live="polite" id="cd-live"></p>`
    : "";
  return `
    <p class="glyph" aria-hidden="true">🎁</p>
    <h1 class="headline">${esc(usdHeadline(state.amountSats))}</h1>
    ${countdown}
    <p class="footnote ${expired ? "warn" : ""}">${esc(line)}</p>
    ${live}
    <div class="stack">
      <button type="button" data-act="open">Open it</button>
    </div>
    <details class="explain">
      <summary>what is this?</summary>
      <p>A friend sent you bitcoin as a link. Opening it makes it yours and kills the old link. Small amounts. No app, no account. If you wait past the time above, they can take it back — until then it's yours to open.</p>
    </details>
  `;
}

function viewOwned() {
  const approx = approxUsd(state.amountSats);
  return `
    <p class="glyph spring" aria-hidden="true">✨</p>
    <h1 class="headline">You own bitcoin now.</h1>
    <p class="display">${esc(formatSats(state.amountSats))}</p>
    ${approx ? `<p class="footnote">${esc(approx)}</p>` : ""}
    <p class="body">This isn't dollars. It's real bitcoin — its value moves, and it spends as bitcoin.</p>
    <div class="stack">
      <button type="button" data-act="keep">Keep it</button>
      <button type="button" class="ghost" data-act="pass">Pass some on</button>
    </div>
    <p class="footnote warn">don't just close this tab — pick one</p>
  `;
}

function viewKeep() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const how = ios
    ? "On iPhone: tap Share, then Add to Home Screen."
    : "Use your browser menu → Add to Home Screen.";
  const saved = state.saved
    ? `<p class="body">Saved on this phone. ${esc(how)}</p>`
    : `<p class="body">${esc(how)}</p>`;
  return `
    <h1 class="headline">Keep it</h1>
    ${saved}
    <div class="stack">
      <button type="button" data-act="homescreen">Add to home screen</button>
      <button type="button" class="ghost" data-act="move">Move to a real wallet</button>
    </div>
    <p class="footnote warn">a browser tab is not a vault — pick one of these</p>
  `;
}

function viewWallet() {
  const cashu = state.cashu;
  return `
    <h1 class="headline">Move to a real wallet</h1>
    <p class="body">Import this into cashu.me, Minibits, or eNuts.</p>
    <div class="qr" role="img" aria-label="Cashu token QR code">${qrSvg(cashu)}</div>
    <pre class="token">${esc(cashu)}</pre>
    <div class="stack">
      <button type="button" data-act="copy-token">Copy token</button>
    </div>
    <p class="footnote warn">a browser tab is not a vault — this token is the money</p>
  `;
}

function viewPass() {
  const buttons = passButtons(state.amountSats)
    .map(
      (b) =>
        `<button type="button" class="${b.primary ? "" : "ghost"}" data-act="regift" data-sats="${b.sats}">${esc(b.label)}</button>`,
    )
    .join("");
  return `
    <h1 class="headline">Pass some on</h1>
    <p class="body">You have ${esc(formatSats(state.amountSats))}. Choose an amount to send. You keep the rest.</p>
    <div class="stack">${buttons}</div>
  `;
}

function passButtons(balance) {
  const out = [];
  if (usdPerBtc) {
    for (const usd of USD_AMOUNTS) {
      const sats = satsFromUsd(usd);
      if (sats && sats < balance) out.push({ sats, label: `$${usd}`, primary: out.length === 0 });
    }
  }
  if (out.length === 0) {
    const half = Math.max(1, Math.floor(balance / 2));
    const rest = Math.max(1, balance - 1);
    const seen = new Set();
    for (const sats of [half, rest]) {
      if (sats >= balance || seen.has(sats)) continue;
      seen.add(sats);
      out.push({
        sats,
        label: formatSats(sats),
        primary: out.length === 0,
      });
    }
  }
  return out;
}

function viewLink() {
  const expired = state.locktime && Date.now() / 1000 > state.locktime;
  const countdown = state.locktime
    ? `<p class="display live" aria-hidden="true">${remainingHMS(state.locktime)}</p>`
    : "";
  const line = expired
    ? `the sender can take this back now — first open still wins`
    : `yours until ${untilPhrase(state.locktime)} — after that you can take it back`;
  const pull =
    state.role === "sender"
      ? `<p class="footnote">if it's unclaimed after 24h, come back here to take it back</p>`
      : "";
  return `
    <p class="glyph" aria-hidden="true">🎁</p>
    <h1 class="headline">Text this link</h1>
    ${countdown}
    <p class="footnote">${esc(line)}</p>
    <p class="sr-only" aria-live="polite" id="cd-live"></p>
    <pre class="token">${esc(state.link)}</pre>
    <div class="stack">
      <button type="button" data-act="share">Share</button>
      <button type="button" class="ghost" data-act="copy-link">Copy link</button>
    </div>
    ${pull}
  `;
}

function viewPick() {
  const buttons = USD_AMOUNTS.map((usd, i) => {
    const sats = satsFromUsd(usd);
    const label = sats ? `$${usd}` : formatSats(FALLBACK_SATS[i]);
    const value = sats || FALLBACK_SATS[i];
    return `<button type="button" class="${i === 0 ? "" : "ghost"}" data-act="send" data-sats="${value}" data-usd="${usd}">${esc(label)}</button>`;
  }).join("");
  const feedNote = usdPerBtc
    ? ""
    : `<p class="footnote">price feed is down — amounts are sats, labeled honestly</p>`;
  return `
    ${reclaimBanner()}
    <p class="glyph" aria-hidden="true">🎁</p>
    <h1 class="headline">Send bitcoin as a text</h1>
    <p class="body">Pick an amount. They tap the link. That's it.</p>
    <div class="stack">${buttons}</div>
    ${feedNote}
  `;
}

function reclaimBanner() {
  const r = state.reclaim;
  if (!r) return "";
  if (r.status === "ready") {
    return `<div class="banner">
      <p>A gift you sent can come back now.</p>
      <button type="button" data-act="reclaim">Take it back</button>
    </div>`;
  }
  if (r.status === "working") {
    return `<div class="banner"><p>Taking it back…</p></div>`;
  }
  if (r.status === "taken") {
    return `<div class="banner"><p>Taken back. ${esc(formatSats(r.amountSats))} are on this phone.</p></div>`;
  }
  if (r.status === "raced") {
    return `<div class="banner"><p>They opened it first. The gift is theirs.</p></div>`;
  }
  if (r.status === "error") {
    return `<div class="banner"><p>Could not take it back. Try again.</p>
      <button type="button" data-act="reclaim">Take it back</button></div>`;
  }
  return "";
}

function viewInvoice() {
  const uri = `lightning:${state.invoice}`;
  return `
    <h1 class="headline">Pay this invoice</h1>
    <div class="qr" role="img" aria-label="Lightning invoice QR code">${qrSvg(state.invoice.toUpperCase())}</div>
    <div class="stack">
      <a class="btn" href="${esc(uri)}">Open wallet</a>
      <button type="button" class="ghost" data-act="copy-invoice">Copy invoice</button>
    </div>
    <p class="footnote">Waiting for the payment…</p>
  `;
}

function viewError() {
  return `
    <h1 class="headline">${esc(state.title || "That didn't work")}</h1>
    <p class="body">${esc(state.message)}</p>
    <div class="stack">
      <button type="button" data-act="home">Start over</button>
    </div>
  `;
}

function bind() {
  const main = document.querySelector("main");
  main.onclick = (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const fn = actions[act];
    if (fn) fn(btn);
  };
}

function announceMinute() {
  const el = document.getElementById("cd-live");
  if (!el || !state.locktime) return;
  const left = Math.max(0, state.locktime - Math.floor(Date.now() / 1000));
  const minutes = Math.ceil(left / 60);
  if (minutes === lastAnnouncedMinute) return;
  lastAnnouncedMinute = minutes;
  el.textContent =
    left <= 0
      ? "The exclusive window has ended. The gift may still open."
      : `${minutes} minute${minutes === 1 ? "" : "s"} left to open exclusively`;
}

function startTicker() {
  clearInterval(tickId);
  if (!state.locktime) return;
  tickId = setInterval(() => {
    const live = document.querySelector(".live");
    if (live) live.textContent = remainingHMS(state.locktime);
    announceMinute();
  }, 1000);
  announceMinute();
}

const actions = {
  async open() {
    setState({ name: "opening" });
    try {
      const claimed = await token.claimGift(location.hash);
      store.setHeld({
        proofs: claimed.proofs,
        amountSats: claimed.amountSats,
      });
      history.replaceState(null, "", location.pathname + location.search);
      setState({
        name: "owned",
        proofs: claimed.proofs,
        amountSats: claimed.amountSats,
      });
    } catch {
      setState({
        name: "error",
        title: "This gift is gone",
        message:
          "Someone already opened it, or the sender took it back. First spend wins.",
      });
    }
  },
  keep() {
    setState({
      name: "keep",
      proofs: state.proofs,
      amountSats: state.amountSats,
    });
  },
  async homescreen() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {
      /* persist is best-effort */
    }
    store.setHeld({ proofs: state.proofs, amountSats: state.amountSats });
    setState({
      name: "keep",
      proofs: state.proofs,
      amountSats: state.amountSats,
      saved: true,
    });
  },
  move() {
    const cashu = getEncodedToken({
      mint: ACTIVE_MINT,
      proofs: state.proofs,
      unit: "sat",
    });
    setState({
      name: "wallet",
      proofs: state.proofs,
      amountSats: state.amountSats,
      cashu,
    });
  },
  pass() {
    setState({
      name: "pass",
      proofs: state.proofs,
      amountSats: state.amountSats,
    });
  },
  async regift(btn) {
    const sats = Number(btn.dataset.sats);
    const proofs = state.proofs;
    setState({ name: "opening", message: "Making a new gift…" });
    try {
      const passed = await token.regift(proofs, sats);
      store.setHeld({
        proofs: passed.change,
        amountSats: token.sumSats(passed.change),
      });
      store.addPending({
        id: crypto.randomUUID(),
        refundKey: passed.refundKey,
        lockedProofs: passed.lockedProofs,
        locktime: passed.locktime,
        amountSats: passed.amountSats,
      });
      setState({
        name: "link",
        link: passed.link,
        locktime: passed.locktime,
        role: "sender",
        proofs: passed.change,
        amountSats: token.sumSats(passed.change),
      });
    } catch {
      setState({
        name: "error",
        message: "Could not make a new gift from these sats. Try a smaller amount.",
      });
    }
  },
  async share() {
    try {
      if (navigator.share) {
        await navigator.share({ url: state.link, text: state.link });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
    await copy(state.link);
  },
  async "copy-link"() {
    await copy(state.link);
  },
  async "copy-token"() {
    await copy(state.cashu);
  },
  async "copy-invoice"() {
    await copy(state.invoice);
  },
  async send(btn) {
    const sats = Number(btn.dataset.sats);
    setState({ name: "opening", message: "Asking the mint for an invoice…" });
    try {
      const created = await token.createGift(sats);
      setState({
        name: "invoice",
        invoice: created.invoice,
        quoteId: created.quoteId,
        created,
        sats,
      });
      waitForPay(created, sats);
    } catch {
      setState({
        name: "error",
        message: "Could not reach the mint. Try again in a moment.",
      });
    }
  },
  home() {
    location.hash = "";
    boot();
  },
  async reclaim() {
    const gift = state.reclaim?.gift;
    if (!gift) return;
    setState({ name: "pick", reclaim: { status: "working", gift } });
    try {
      const result = await token.reclaim(gift.refundKey, gift.lockedProofs);
      store.removePending(gift.id);
      if (result.alreadyClaimed) {
        setState({ name: "pick", reclaim: { status: "raced" } });
        return;
      }
      const held = store.getHeld();
      const proofs = [...(held?.proofs || []), ...result.proofs];
      store.setHeld({ proofs, amountSats: token.sumSats(proofs) });
      setState({
        name: "pick",
        reclaim: { status: "taken", amountSats: token.sumSats(result.proofs) },
      });
    } catch {
      setState({
        name: "pick",
        reclaim: { status: "error", gift },
      });
    }
  },
};

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be denied on file:// */
  }
}

async function waitForPay(created, sats) {
  const start = Date.now();
  while (Date.now() - start < 5 * 60 * 1000) {
    if (state.name !== "invoice") return;
    try {
      if (await created.poll()) {
        const gift = await created.finalize();
        store.addPending({
          id: crypto.randomUUID(),
          refundKey: gift.refundKey,
          lockedProofs: gift.lockedProofs,
          locktime: gift.locktime,
          amountSats: gift.amountSats,
        });
        setState({
          name: "link",
          link: gift.link,
          locktime: gift.locktime,
          role: "sender",
        });
        return;
      }
    } catch {
      setState({
        name: "error",
        message: "The mint did not finish this gift. The invoice may have expired.",
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

function render() {
  const main = document.querySelector("main");
  main.replaceChildren();
  const screen = document.createElement("div");
  screen.className = "screen";
  screen.innerHTML = view();
  main.appendChild(screen);
  bind();
  startTicker();
}

async function bootClaim(fragment) {
  try {
    const info = token.inspectGift(fragment);
    setState({
      name: "teaser",
      amountSats: info.amountSats,
      locktime: info.locktime,
    });
  } catch {
    setState({
      name: "error",
      title: "This link isn't a gift",
      message: "The secret in the link is missing or damaged.",
    });
  }
}

async function boot() {
  await store.hydrate();
  await loadPrice();
  if (location.hash && location.hash.length > 1) {
    await bootClaim(location.hash);
    return;
  }
  const now = Date.now() / 1000;
  const due = store.getPending().find((g) => g.locktime && g.locktime <= now);
  setState({
    name: "pick",
    reclaim: due ? { status: "ready", gift: due } : null,
  });
}

window.addEventListener("hashchange", () => boot());
boot();
