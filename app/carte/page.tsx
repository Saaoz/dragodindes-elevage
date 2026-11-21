import type { Metadata } from "next";
import { CartePage } from "@/components/carte/carte-page";

export const metadata: Metadata = { title: "Carte du site" };

export default function Page() {
  return <CartePage />;
}
