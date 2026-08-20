import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";

import "./globals.css";

export const metadata: Metadata = {
  title: "Passage — Global shipping routes through time",
  description: "Explore how the world's commercial shipping corridors occupy the ocean and change through time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
