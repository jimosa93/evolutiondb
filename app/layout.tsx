import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Usuarios · Evolution DB",
  description: "Consulta y gestión de registros en la tabla users",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
