import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

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
    <html lang="es" className={dmSans.variable}>
      <body className="font-[family-name:var(--font-dm-sans)] antialiased">
        {children}
      </body>
    </html>
  );
}
