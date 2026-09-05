// Feature flags.
//
// SOCIAL_ENABLED — the social layer (Communauté + messagerie privée) only
// works with a shared central server: two people on two machines with their
// own local databases have no way to exchange a message, a follow or a feed
// item. The local, single-machine build therefore ships with it OFF:
//   - no "Communauté" / "Messages" entries in the sidebar,
//   - every /community/* and /messages/* route returns 404,
//   - the server actions and API routes behind them refuse to run.
// An install that talks to a central Vidalyse instance turns it back on with
//   NEXT_PUBLIC_VIDALYSE_SOCIAL=on
// (NEXT_PUBLIC_ so the client bundle — Sidebar, AppShell — sees it too).
export const SOCIAL_ENABLED = process.env.NEXT_PUBLIC_VIDALYSE_SOCIAL === "on";
