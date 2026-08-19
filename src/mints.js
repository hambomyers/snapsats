/**
 * ONE mint in v0. Users never see this file. Swap ACTIVE_MINT to a mainnet
 * entry from the parked list only when friends-and-family begins — never
 * in development, never in tests.
 */
export const ACTIVE_MINT = "https://testnut.cashu.space";

// Parked shortlist — not wired, not selectable, not imported.
// https://mint.minibits.cash/Bitcoin
// https://stablenut.cashu.network
// https://mint.minibits.cash/Bitcoin  (mainnet — real sats; do not use in tests)
