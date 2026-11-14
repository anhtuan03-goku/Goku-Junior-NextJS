import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MinimalHeader } from "@/components/layout/minimal-header";
import { AppProviders } from "@/components/providers/app-providers";
import { getOptionalSafeSessionUser } from "@/interfaces/http/api-helpers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "goku.frame — Không gian hình ảnh & nhật ký tối giản",
  description:
    "Khám phá hình ảnh nghệ thuật, lưu trữ bộ sưu tập cá nhân và viết bài viết tối giản với cam kết bảo mật Zero-PII.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUser = await getOptionalSafeSessionUser();

  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans min-h-screen flex flex-col`}
      >
        <AppProviders initialUser={initialUser}>
          <MinimalHeader />
          <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
          <footer className="border-t border-border/60 py-5 text-center text-[11px] text-muted-foreground px-4">
            goku.frame · Chính sách Zero-PII: Không thu thập email, số điện thoại hay thông tin định danh cá nhân.
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
