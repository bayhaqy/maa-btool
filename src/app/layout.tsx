import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MAA BTOOL — Enterprise Master Data Management",
    template: "%s · MAA BTOOL",
  },
  description:
    "Enterprise Master Data Management platform for MAP Group (PT Mitra Adiperkasa Tbk). Data governance, workflow approval, hierarchy management, and API integration.",
  keywords: [
    "MAA BTOOL",
    "MDM",
    "Master Data Management",
    "MAP Group",
    "Mitra Adiperkasa",
    "Enterprise",
    "Data Governance",
    "Workflow Approval",
  ],
  authors: [{ name: "MAA BTOOL Team" }],
  creator: "MAP Group — PT Mitra Adiperkasa Tbk",
  publisher: "MAP Group",
  applicationName: "MAA BTOOL",
  formatDetection: { telephone: true, address: false, email: true },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/map-active-logo.png", type: "image/png", sizes: "1830x914" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/map-active-logo.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "icon", url: "/icon.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "MAA BTOOL",
    title: "MAA BTOOL — Enterprise Master Data Management",
    description:
      "Enterprise MDM platform for MAP Group. Data governance, workflow approval, and hierarchy management.",
    images: [{ url: "/map-active-logo.png", width: 1830, height: 914, alt: "MAA BTOOL" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MAA BTOOL — Enterprise MDM",
    description: "Enterprise Master Data Management platform for MAP Group.",
    images: ["/map-active-logo.png"],
  },
  robots: {
    index: false, // Internal enterprise app — don't index
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#DC2626" },
    { media: "(prefers-color-scheme: dark)", color: "#991B1B" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload primary font + favicon for faster paint */}
        <link rel="icon" href="/map-active-logo.png" type="image/png" sizes="1830x914" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/map-active-logo.png" />
        <link rel="preload" as="image" href="/map-active-logo.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
          {/* Vercel Analytics — page-view tracking (no config needed on Vercel) */}
          <Analytics />
          {/* Vercel Speed Insights — Core Web Vitals collection */}
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
