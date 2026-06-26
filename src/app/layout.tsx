import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Typography system (2026 viral standard — enhanced for eye-catching display)
 *
 * Viral 2026 fonts selected:
 * - Plus Jakarta Sans : body / UI text (modern geometric sans-serif, SEA tech trend, TikTok-era branding)
 * - Space Grotesk     : display / headings (geometric sans-serif w/ distinctive letterforms, AI/startup branding)
 * - JetBrains Mono    : code / monospace (premium developer font, GitHub/Vercel aesthetic)
 *
 * Enhancements:
 * - `adjustFontFallback: true` reduces layout shift via metric-matched fallbacks
 * - `preload: true` for critical above-the-fold fonts
 * - Full weight spectrum loaded (200-800 for Jakarta, 300-700 for Grotesk) for true variable impact
 * - Font CSS variables applied to <html> so they cascade to :root globally
 * - Optical sizing enabled in CSS for variable-font-aware rendering
 */
const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakartaSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Preload primary font + favicon for faster paint */}
        <link rel="icon" href="/map-active-logo.png" type="image/png" sizes="1830x914" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/map-active-logo.png" />
        <link rel="preload" as="image" href="/map-active-logo.png" />
      </head>
      <body
        className="antialiased bg-background text-foreground"
        style={{
          // Critical fallback in case @theme inline hasn't loaded yet — prevents FOUT to system font
          fontFamily:
            'var(--font-jakarta, "Plus Jakarta Sans"), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          // Variable font optimizations — make the font "pop" with optical sizing
          fontOpticalSizing: "auto",
          fontSynthesis: "weight style",
        }}
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
