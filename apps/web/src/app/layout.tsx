import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "@/lib/react-query-provider";
import { PwaInstallProvider } from "@/lib/pwa-install-provider";
import { UiProviders } from "@/components/providers";
import { AuthProvider } from "@/lib/auth-context";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { CelebrationProvider } from "@/lib/celebration-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LOOPLI CRM",
  description: "Premium Project & Issue Management System",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LOOPLI",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1220",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <PwaInstallProvider>
          <AuthProvider>
            <ReactQueryProvider>
              <UiProviders>
                <CelebrationProvider>
                  <AuthenticatedLayout>{children}</AuthenticatedLayout>
                </CelebrationProvider>
              </UiProviders>
            </ReactQueryProvider>
          </AuthProvider>
        </PwaInstallProvider>
      </body>
    </html>
  );
}
