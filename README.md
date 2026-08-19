# SnapSats

**Bitcoin you can text. A wallet that opens when they tap.**

Text someone "happy birthday" and $25 in bitcoin. They tap the link. It's theirs. No app, no account, no seed phrase, no signup, no permission dialogs. If they don't open it within 24 hours, come back to this page to take it back. If they do, they can keep it — or pass some on to someone else and become a bitcoin sender ten seconds after becoming a bitcoin owner.

That's the whole product. → snapsats.app

## How it works

```
SENDER
  |  has sats already
  |  (Cash App / Strike /
  |   any Lightning wallet)
  v
snapsats.app
  |  pick $5/$10/$25/$50
  |  pay one LN invoice
  v
 MINT issues time-locked
 ecash token
  |
  v
 LINK  snapsats.app/#secret
  |  (secret lives after the #
  |   — browsers never send it
  |   to any server)
  |
  |  texted with "happy bday"
  |  iMessage / SMS / anything
  v
RECIPIENT taps
  |
  v
 claim page (browser = the UI)
 sweeps to a fresh key
 old link is now dead
  |
  +-> KEEP IT   (make it durable)
  +-> PASS SOME ON --+
                     |
        new link, new 24h timer,
        NO new funding needed —
        loops back to LINK
[unclaimed at 24h? come back here
 to take it back — the timelock
 is in the token itself, not on
 anyone's server. Pull, not push.]
```

Only the **first** sender in any chain ever funds anything. Everyone downstream is both recipient and sender with zero setup. The money carries its own UI, because the UI is a link and the link travels with the money.

## The philosophy: subtraction

This project got better every time we removed something. That's the method. Every previous attempt at "send bitcoin to a normal person" drowned in parts — apps, accounts, KYC, seed phrases, companies, business models. Each part had a defensible reason. Together they guaranteed nobody's grandmother ever received bitcoin in a text.

So we deleted, and kept deleting until deleting more would break it:

- **Deleted the app.** Every phone ships with the install mechanism pre-loaded: the browser. Tapping the link *is* the download.
- **Deleted accounts and permissions.** A wallet is a key, created as the page loads. Claiming asks for no camera, no notifications, no signup. The tap is the consent.
- **Deleted the server.** One static file on free hosting. No backend, no database, no user table. Nothing to hack, nothing to subpoena, nothing whose unpaid hosting bill strands anyone's money.
- **Deleted the company.** No revenue model, on purpose. Projects like this historically die trying to monetize $20 gifts; a protocol with no revenue requirement cannot die of no revenue. Maintainers are paid in commit history.
- **Deleted seed phrases and security ceremonies.** For amounts small enough to lose, the ceremony *was* the attack — it's what stopped people from claiming. This money behaves like cash in a pocket.
- **Deleted permanence.** Money isn't meant to rest here. The claim page is a hot potato, not a vault. The 24-hour timer isn't a growth hack — it's honest UI over how the token actually works.
- **Deleted choices.** Four fixed amounts. One timer. One vetted mint. Configuration is where complexity sneaks back in wearing a nice shirt.
- **Deleted fiat.** Senders pay a Lightning invoice, full stop. Card processing would resurrect the entire deleted company. (Pleasant irony: Cash App pays Lightning invoices, so the KYC world can be your on-ramp without SnapSats inheriting any of it.)
- **Deleted ourselves from the money path.** Gifts are standard [Cashu](https://cashu.space) ecash. If this site vanishes tomorrow, every outstanding gift stays redeemable in any Cashu wallet (cashu.me, Nutstash, Minibits, eNuts...). Nobody's money depends on this project existing. We refuse to un-delete this.

What's left is one file, standing on protocols other people built and a mint other people run.

## It's bitcoin, and it says so

SnapSats onboards people to bitcoin — so the moment of ownership tells the truth:

> **You own bitcoin now.**
> 35,700 sats (~$25 *right now*)
> This isn't dollars. It's real bitcoin — its value moves, and it spends as bitcoin.

Dollar framing earns the tap ("$25 in bitcoin" in the text preview — bait with the familiar). Bitcoin framing owns the reveal (teach at the moment of ownership). Sats first, dollars in parentheses, "right now" doing quiet work. Honesty here deletes a future disappointment, a wrong mental model, and a support conversation — net subtraction.

## What this is, technically

A gift is a Cashu ecash token — a bearer string that *is* the money, backed by a mint, settled over Bitcoin's Lightning Network — wrapped in a link with the secret in the URL fragment. Tokens are time-locked: after 24 hours the sender can reclaim an unclaimed gift (the mint will not push it back — you have to come back and take it). First open sweeps funds to a fresh key, so the link in the message thread dies the moment it's used. After the deadline the recipient can still open it until you do; first spend wins.

## Honest limits — read this part

- **The mint is a custodian.** Small, auditable, privacy-preserving (it can't see who holds what) — but a custodian. If the mint dies, tokens it backs die with it. Gift-card risk. Which is why:
- **Small amounts only.** $50 max, enforced by the interface. Use amounts small enough to lose. This is a firework, not a vault.
- **Whoever holds an unclaimed link holds the money.** Like cash. The 24-hour window and claim-time key rotation shrink this; they don't erase it.
- **A browser tab is not a vault.** Safari can evict site storage after ~7 days idle. The claim page pushes you to make it durable or pass it on — listen to it.
- **No security audit yet.** Real sats, real bugs possible. See DEVELOPMENT.md.

## Status

Pre-v0. Design is settled; code is not. See [DEVELOPMENT.md](DEVELOPMENT.md).

## License

MIT. Fork it, mirror it, outlive us.
