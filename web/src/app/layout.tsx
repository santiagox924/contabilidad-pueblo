import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contabilidad del Pueblo",
  description: "MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 👇 Esto es un Server Component (no pongas "use client" aquí)
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
