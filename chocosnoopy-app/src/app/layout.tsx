import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: "Chocosnoopy",
  description: "Sistema de gestión interna para Chocosnoopy",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F3BFCC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ToastProvider>
          <div className="mx-auto min-h-screen w-full max-w-lg px-4 pb-24 pt-5">
            {children}
          </div>
          <Navbar />
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
