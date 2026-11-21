import React from "react";
import { PulseCastWorkspace } from "@/components/PulseCastWorkspace";

export function generateStaticParams() {
  return [{ sessionId: "pulse-live-studio" }];
}

export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const cleaned =
    (sessionId || "pulse-live-studio")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 64) || "pulse-live-studio";

  return (
    <PulseCastWorkspace
      initialSessionId={cleaned}
      isDedicatedLiveRoute={true}
    />
  );
}
