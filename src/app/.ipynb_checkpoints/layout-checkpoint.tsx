import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// --- 1. Import the MapsProvider you created ---
import { MapsProvider } from "@/components/providers/MapsProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CityBreaker – Ultimate City Break Planner",
  description: "Plan your perfect city break with CityBreaker. Discover and explore your favourite cities worldwide.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900`}
      >
        {/* --- 2. Wrap your {children} with the MapsProvider --- */}
        {/* This ensures the Google Maps script is loaded once for all pages */}
        <MapsProvider>
          {children}
        </MapsProvider>
      </body>
    </html>
  );
}