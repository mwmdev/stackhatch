import { redirect } from "next/navigation";
import AllMapsPage from "@/components/AllMapsPage";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function AllMapsRoute() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?callbackUrl=%2Fapp%2Fmaps");

  return <AllMapsPage isAdmin={user.role === "admin"} />;
}
