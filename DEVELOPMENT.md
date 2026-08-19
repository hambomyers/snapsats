# SnapSats — Development Notes

High-level only. The moment this document needs a table of contents, we've failed.

## The one rule

**Every proposed addition must justify why it can't be a deletion.** Default answer to new features is no. Parts count is the metric: one file we write, a mint other people run, messaging apps everyone has. Keep it three.

## Architecture at 50,000 feet

- **Money layer:** Cashu ecash (via `cashu-ts`). The token is the money.
- **Trust layer:** ONE vetted, reputable mint in v0. A shortlist lives in `mints.js` for swapping; users never see a mint choice.
- **Security layer:** claim-then-rotate (link dies on first open) + protocol-level timelock (sender reclaim after 24h — pull, not push). No accounts, no auth in v0. Optional "secure this" upgrades come later.
- **Transport layer:** none of our business. SMS, iMessage, WhatsApp, a QR on a napkin.
- **Backend:** there isn't one. Static hosting (GitHub Pages → snapsats.app). Load-bearing minimalism: no server means no custody, no user data, no single point of failure.

## v0 scope — the whole thing

**Send:** pick $5 / $10 / $25 / $50 (no free entry — four buttons, cap is structural) → pay one Lightning invoice → get link + 24h timer → text it yourself from your own messaging app. After expiry, return to this page to take it back.

**Claim:** three screens, two taps total from text to ownership.

Screen 1 — what lands in their Messages (we control the link-preview card; their personal note rides above it because the *sender* texted it — we never touch anyone's messages):

```
┌─────────────────────────┐
│ ┌─────────────────────┐ │
│ │ Happy birthday!! 🎂 │ │
│ │ ┌─────────────────┐ │ │
│ │ │ 🎁 $25 in       │ │ │
│ │ │    bitcoin      │ │ │
│ │ │ snapsats.app    │ │ │
│ │ └─────────────────┘ │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

Screen 2 — tap the link, browser opens, one button:

```
┌─────────────────────────┐
│          🎁             │
│    $25 in bitcoin       │
│  from a link Dad sent   │
│                         │
│  ┌───────────────────┐  │
│  │     Open it       │  │
│  └───────────────────┘  │
│                         │
│  yours until 9:14 pm —  │
│  after that they can    │
│  take it back           │
│  what is this? ˅        │
└─────────────────────────┘
```

The tap on **Open it** performs the sweep — the old link dies at this moment.

Screen 3 — ownership, told truthfully (bitcoin is the noun, dollars are the translation):

```
┌─────────────────────────┐
│          ✨             │
│   You own bitcoin now.  │
│                         │
│      35,700 sats        │
│    (~$25 right now)     │
│                         │
│  This isn't dollars.    │
│  It's real bitcoin —    │
│  its value moves, and   │
│  it spends as bitcoin.  │
│                         │
│  ┌───────────────────┐  │
│  │ 🔒 Keep it        │  │
│  ├───────────────────┤  │
│  │ 🎁 Pass some on   │  │
│  └───────────────────┘  │
│                         │
│  ⚠ don't just close     │
│    this tab — pick one  │
└─────────────────────────┘
```

- **Keep it** → "add to home screen" (durable storage, app-feel without an app) or "move to a real wallet" (show the token / QR for import into any Cashu wallet — this is also the spend-as-bitcoin path). Honest about tab fragility.
- **Pass some on** → choose an amount ≤ balance (word "some" is deliberate — keeps the gift from being flung whole at a friend), fresh link + fresh 24h timer, share sheet opens. **No new funding needed** — this is the viral loop and the teaching moment in one tap.

**Deliberately NOT in v0 (deleted this pass):**
- **Spend button.** A Lightning send flow (invoice parsing, fees, error states) is ~a third of the build for the button a birthday recipient presses least. "Move to a real wallet" already covers spending as bitcoin. Returns in v1.
- Free amount entry, timer options, mint selection — configuration is complexity in a nice shirt.

Success metric, singular: **seconds from text-received to owned sats.** Target under 60, for someone who has never heard the word "sats."

## Proposed file tree

```
snapsats/
├── README.md            # philosophy, flow diagram, honest limits
├── DEVELOPMENT.md       # this file
├── LICENSE              # MIT
├── index.html           # THE PRODUCT — send + claim, single static page
├── src/
│   ├── app.js           # flows: create, claim/sweep, reclaim, pass-on
│   ├── token.js         # cashu-ts wrapper: mint/melt, timelock, rotation
│   ├── mints.js         # the vetted mint + parked shortlist
│   └── style.css        # beautiful, obvious, one screen at a time
└── test/
    └── flows.test.js    # the two flows, against a test mint
```

Growth of this tree requires a written reason in the PR. `src/` exists for sanity while developing; the shipped artifact should remain a single file.

## Known open problems (do not pretend these are solved)

1. **Mint trust.** Mitigated by the $50 cap + choosing an audited mint (reserve-auditing tooling exists and is improving). Never zero. Revisit quarterly.
2. **Browser storage eviction.** Safari can wipe site storage after ~7 days idle. v0's answer is the hot-potato design — money should leave the page rather than rest in it — plus honest copy on Keep. Durable paths (PWA persistence, Nostr-backed state via NIP-60) need validation on real iPhones before being promised.
3. **SMS spam filters** may eat crypto-looking links. snapsats.app reads clean, which helps; still needs field testing across carriers.
4. **Link-preview prefetch** is handled by design (secret in the #fragment is never sent to servers; claiming requires an interactive tap) — but verify against real iMessage/WhatsApp preview behavior in the device gauntlet.
5. **No audit.** Before promotion beyond friends & family: external review of token handling, fragment hygiene, and the sweep flow. Real money, day one.
6. **Virality is a hypothesis.** Nobody knows if normal people claim and pass it on. That's what shipping is for.

## Sequencing

1. Claim flow against a test mint (hardest UX — build first)
2. Send flow + timelock/sender-reclaim (pull)
3. Pass-some-on loop
4. Real-device gauntlet: iOS Safari, Android Chrome, links opened from iMessage/WhatsApp/SMS, preview-bot behavior
5. Friends & family with real (tiny) sats
6. Security review → then, and only then, make noise

## Non-goals (deletions already made — do not resurrect)

Native apps · accounts · permission dialogs · our own mint · KYC · fiat/card
funding · free-form amounts · configuration screens · amounts worth crying
over · backend services · analytics · a Spend button in v0 · tokens/points/
anything that isn't bitcoin · a business model

## Deploy

Fewer parts than a second branch: GitHub Actions builds `dist/` and publishes it. `CNAME` lives in the repo (and `public/`, so Vite copies it into `dist/`).

1. Push to GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. Custom domain: `snapsats.app`. Enforce HTTPS.
4. DNS (once the Pages site exists):

```
snapsats.app.     A      185.199.108.153
snapsats.app.     A      185.199.109.153
snapsats.app.     A      185.199.110.153
snapsats.app.     A      185.199.111.153
snapsats.app.     AAAA   2606:50c0:8000::153
snapsats.app.     AAAA   2606:50c0:8001::153
snapsats.app.     AAAA   2606:50c0:8002::153
snapsats.app.     AAAA   2606:50c0:8003::153
www.snapsats.app. CNAME  <you>.github.io.
```

The shipped artifact is `dist/index.html` (one file). It also renders from `file://`. Offline, the page still paints; the price feed and mint calls fail closed (sats-only labels, no invoice until the mint answers).
