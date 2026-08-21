"use client";

import dynamic from "next/dynamic";

const PassageExplorer = dynamic(
  () => import("@/components/PassageExplorer").then((module) => module.PassageExplorer),
  { ssr: false },
);

export default function Home() {
  return <PassageExplorer />;
}
