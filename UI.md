# SnapSats — UI Architecture

The interface for a bitcoin gift should feel like a gift, read like a text
message, and contain nothing else. This document is the whole UI spec.
DEVELOPMENT.md's screen mocks and copy are canonical; this adds the
architecture underneath them. Anything visual not specified here does not
exist.

## The one idea

**The UI is a state machine with no navigation.** There is no menu, no
header, no footer, no logo lockup, no settings, no back button, no router,
no pages. The URL fragment decides which machine you're in; the machine
shows exactly one screen at a time; every screen has at most one primary
action. If a screen needs a second paragraph to explain itself, the screen
is wrong.

```
URL has #token  ──> CLAIM machine        URL is bare ──> SEND machine

CLAIM:  teaser ──open──> owned ──┬─> keep  (terminal)
        │                        └─> pass ──> new link (loops to "link")
        └─ expired? same teaser, honest line about sender reclaim

SEND:   pick ──invoice paid──> link  (terminal: share it)
                                └─ revisit w/ expired unclaimed gift?
                                   reclaim banner, one tap
```

Implementation: one `render(state)` function, one state object, states as
plain strings. No routing library, no components framework — a `<main>`
whose children are replaced wholesale on each transition. Transition =
re-render. That's the entire architecture; anything fancier is deleted.

## Layout: one column, one thumb

- Single centered column, `max-width: 26rem`, generous side padding.
  Designed at 375px; desktop just gets more margin. No breakpoints beyond
  that — nothing in this product needs two columns, ever.
- Vertical rhythm from a 4px base scale. Space is the chrome: screens are
  emoji-scale glyph → headline → (value) → action(s) → footnote, separated
  by whitespace, not rules or cards.
- Tap targets ≥ 56px tall, full column width. Buttons stack vertically,
  never side by side. Primary action sits in the natural thumb zone
  (lower half), footnotes below it.
- One screen must fit one phone viewport with no scrolling. If it
  scrolls, cut copy until it doesn't. (Exception: the collapsed
  "what is this?" explainer may extend below the fold when opened.)

## Type: the countdown is the identity

System font stack only (`-apple-system, system-ui, ...`). Zero webfonts —
a claim page racing a curious recipient does not spend its first 300ms
downloading typography, and the gift should feel native to the phone it
landed on, like the text message it arrived in.

Character comes from scale and weight, not typeface:

- `display` — the sats amount and countdown: huge (clamp ~2.5–3.5rem),
  weight 800, `font-variant-numeric: tabular-nums` so the ticking
  countdown doesn't shimmy.
- `headline` — "You own bitcoin now." ~1.5rem, weight 700.
- `body` — 1rem/1.5, weight 400, max ~34ch measure.
- `footnote` — 0.85rem, muted color, for timers, warnings, "(~$25 right now)".

**The signature element is the live countdown**: big tabular numerals,
always visible on teaser and send-link screens, counting real seconds.
It is the only moving thing in the interface (see Motion). Everything
else stays quiet so this one honest, slightly rebellious heartbeat —
*this money is alive and it's leaving* — is what the product is
remembered by.

## Color: night, paper, and one ember

Dark by default — gifts get opened at night, and a dark page makes the
glyph and numerals glow like a lock screen. Light mode honors
`prefers-color-scheme`. Six tokens, no more:

| token      | dark       | light     | job                                |
|------------|-----------|-----------|-------------------------------------|
| `--bg`     | `#0E0F12` | `#FAFAF8` | the room                            |
| `--ink`    | `#F2F0EB` | `#17181C` | all text                            |
| `--muted`  | `#8A8F98` | `#6B7078` | footnotes, timers at rest           |
| `--ember`  | `#F7931A` | `#E07B00` | THE accent: primary button, sats    |
| `--line`   | `#26282E` | `#E4E2DC` | hairlines (QR frame, explainer)     |
| `--warn`   | `#E8B84B` | `#B07E10` | countdown < 2h, fragility warnings  |

`--ember` is bitcoin orange, used exactly twice per screen maximum (the
primary button fill and the sats figure). No gradients, no shadows deeper
than 1px hairlines, no glassmorphism, no border-radius larger than 12px.
Secondary buttons are `--line`-bordered ghosts. Error states are plain
`--ink` sentences that say what happened and what to do — never red
panic, never apology.

## Motion: three moments, nothing else

1. Countdown ticks (1s interval, numerals only).
2. Screen transitions: 150ms fade/8px rise on the incoming screen. One
   direction, every transition, so the machine feels like one object.
3. The claim: tapping **Open it** is the only celebration in the product —
   glyph scales 🎁→✨ with a ~400ms spring as Screen 3 arrives. No
   confetti libraries; it's a CSS transform.

`prefers-reduced-motion`: all three become instant. No looping
animations, no skeleton shimmer — states that wait (invoice polling,
sweep in flight) show a static line of copy saying what's happening
("Waiting for the payment…"), because words are cheaper than spinners
and this brand explains itself.

## Copy is the chrome (rules, not suggestions)

- Buttons say what happens: "Open it", "Keep it", "Pass some on",
  "Take it back". Never "Submit", "Continue", "OK".
- Sentence case everywhere. No exclamation marks except the sender's own
  message. The product is calm; the gift is the exciting part.
- Numbers tell the truth: sats first, dollars in parentheses with
  "right now", countdown shows real token locktime. If the price feed
  fails, dollars silently disappear — sats never do.
- Deadlines are framed as lost exclusivity, not detonation: "yours until
  9:14 pm tomorrow — after that Dad can take it back."
- Every screen may carry at most ONE footnote warning. If two truths
  compete for it, the scarier one wins and the other moves to the
  "what is this?" explainer.

## Quality floor (invisible, non-negotiable)

Keyboard focus visible (`--ember` outline) · all glyph-only elements
carry text labels for screen readers · countdown has an `aria-live`
polite region at minute granularity (not second — don't chatter) ·
contrast ≥ 4.5:1 for all text including `--muted` on `--bg` · works
identically from `file://`, GitHub Pages, and a home-screen icon.

## The test

Screenshot any screen. If someone who has never heard of SnapSats can't
say within three seconds (a) what this is, (b) what it's worth, and
(c) what to tap — delete something and screenshot again.
