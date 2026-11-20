import type { Metadata } from "next";
import { RentabilitePage } from "@/components/rentabilite/rentabilite-page";

export const metadata: Metadata = { title: "Rentabilité" };

export default function Page() {
  return <RentabilitePage />;
}
