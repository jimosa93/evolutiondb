import type { Metadata } from "next";

import { SessionsPanel } from "@/app/components/SessionsPanel";

export const metadata: Metadata = {
  title: "Sesiones de Evolution · Evolution DB",
  description: "Sesiones de integración (IntegrationSession)",
};

export default function SesionesPage() {
  return <SessionsPanel />;
}
