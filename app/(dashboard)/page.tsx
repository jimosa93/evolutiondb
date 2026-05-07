import type { Metadata } from "next";

import { UsersPanel } from "@/app/components/UsersPanel";

export const metadata: Metadata = {
  title: "Usuarios en base de datos · Evolution DB",
  description: "Consulta y gestión de la tabla users",
};

export default function UsuariosPage() {
  return <UsersPanel />;
}
