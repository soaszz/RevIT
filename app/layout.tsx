import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ConnectionStatusModal from "./components/ConnectionStatusModal";
import PwaRegistration from "./components/PwaRegistration";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./neumorphism.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;
  const title = "RevIT | Review It Thoroughly";
  const description = "RevIT helps Medical Technology students review their subjects and prepare for MTAP and board exams with structured practice, study planning, progress tracking, and educational AI support.";

  return {
    title: {
      default: title,
      template: "RevIT | %s",
    },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "RevIT Medical Technology reviewer for MTAP and board exam preparation" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
    icons: {
      icon: [
        { url: "/revit-rounded.png", sizes: "32x32", type: "image/png" },
        { url: "/revit-rounded.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/revit-rounded.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#071613" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${dmSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("revit-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        {children}
        <ConnectionStatusModal />
        <PwaRegistration />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
