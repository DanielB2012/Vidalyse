import { notFound } from "next/navigation";
import { SOCIAL_ENABLED } from "@/lib/features";

// The whole /community/* subtree is off unless the social layer is enabled
// (see src/lib/features.ts). notFound() here covers every nested page at once.
export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  if (!SOCIAL_ENABLED) notFound();
  return <>{children}</>;
}
