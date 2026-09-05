"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { toggleBlock, type ToggleBlockResult } from "@/lib/community/block";
import { createReport, type CreateReportInput, type CreateReportResult } from "@/lib/moderation/report";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");
  return session.user.id;
}

export async function toggleBlockAction(targetUserId: string): Promise<ToggleBlockResult> {
  const userId = await requireUserId();
  const res = await toggleBlock(userId, targetUserId);
  if (res.ok) {
    revalidatePath("/messages");
    revalidatePath("/community");
  }
  return res;
}

export async function reportAction(input: CreateReportInput): Promise<CreateReportResult> {
  const userId = await requireUserId();
  return createReport(userId, input);
}
