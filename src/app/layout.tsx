import type { Metadata } from "next";
import { IBM_Plex_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const ibmMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Dental Cavity Detector",
  description: "AI-powered dental X-ray analysis — YOLOv8m · mAP50 0.758",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${ibmMono.variable}`}>
        {children}
      </body>
    </html>
  );
}