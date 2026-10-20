import type { Metadata } from "next";
import AllMapsPage from "@/components/AllMapsPage";

export const metadata: Metadata = { title: "All maps" };

export default function AllMapsRoute() {
  return <AllMapsPage />;
}
