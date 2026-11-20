import type { Metadata } from "next";
import { EnclosPanel } from "@/components/enclos/enclos-panel";

export const metadata: Metadata = { title: "Mes enclos" };

export default function EnclosPage() {
  return <EnclosPanel />;
}
