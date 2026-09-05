"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function createProject(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");

  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!title) return;

  await prisma.project.create({
    data: { userId: session.user.id, title, notes: notes || null },
  });

  revalidatePath("/projects");
}

export async function updateProjectStatus(projectId: string, status: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");

  await prisma.project.update({
    where: { id: projectId, userId: session.user.id },
    data: { status: status as "IDEA" | "IN_PROGRESS" | "READY" | "PUBLISHED" },
  });

  revalidatePath("/projects");
}
