import type { Metadata } from "next";

import { CertificarPdfPanel } from "@/app/components/CertificarPdfPanel";

export const metadata: Metadata = {
  title: "Certificar PDF · Evolution DB",
  description: "Personalización de reportes Certificar PDF con branding AutoCheck",
};

export default function CertificarPdfPage() {
  return <CertificarPdfPanel />;
}
