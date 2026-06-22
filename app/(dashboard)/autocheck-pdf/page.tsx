import type { Metadata } from "next";

import { AutocheckPdfPanel } from "@/app/components/AutocheckPdfPanel";

export const metadata: Metadata = {
  title: "Autocheck PDF · Evolution DB",
  description: "Personalización de reportes PDF con branding Autocheck",
};

export default function AutocheckPdfPage() {
  return <AutocheckPdfPanel />;
}
