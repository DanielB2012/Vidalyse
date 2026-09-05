import { prisma } from "@/lib/prisma";

// RGPD right-to-erasure (art. 17). Almost every user-owned row cascades from
// `User` via `onDelete: Cascade` (accounts, sessions, videos, jobs, public
// profile, follows, likes, conversations, messages, blocks, reports…), so one
// delete purges effectively everything.
//
// Known limitation, accepted for now rather than re-modeling Conversation:
// deleting a user also deletes any Conversation they're part of, which
// cascades to DirectMessage rows the OTHER participant sent too — so the
// other side loses that thread's history as a side effect of this account's
// deletion. Acceptable for a 1:1 DM feature at this scale.
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
}
