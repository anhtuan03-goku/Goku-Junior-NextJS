import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { AppProviders } from "@/components/providers/app-providers";
import { getOptionalSafeSessionUser } from "@/interfaces/http/api-helpers";
import { SITE_CONFIG, getSiteUrl } from "@/lib/site-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: SITE_CONFIG.title,
    template: `%s · ${SITE_CONFIG.name}`,
  },
  description: SITE_CONFIG.description,
  applicationName: SITE_CONFIG.name,
  keywords: [...SITE_CONFIG.keywords],
  authors: [{ name: SITE_CONFIG.name }],
  creator: SITE_CONFIG.name,
  publisher: SITE_CONFIG.name,
  category: "photography",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: SITE_CONFIG.name,
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUser = await getOptionalSafeSessionUser();
  const baseUrl = getSiteUrl().origin;

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_CONFIG.name,
    url: baseUrl,
    description: SITE_CONFIG.description,
    inLanguage: "en-US",
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans min-h-screen flex flex-col`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <AppProviders initialUser={initialUser}>
          <MinimalHeader />
          <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
          <footer className="border-t border-border/60 py-5 px-4">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                © {new Date().getFullYear()} {SITE_CONFIG.name} · Minimalist
                visual journal.
              </span>
              <div className="flex items-center gap-4">
                <Link
                  href="/community"
                  className="hover:text-foreground transition-colors"
                >
                  Community
                </Link>
                <Link
                  href="/privacy"
                  className="underline underline-offset-4 hover:text-foreground transition-colors"
                >
                  Zero-PII Privacy Policy
                </Link>
              </div>
            </div>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
