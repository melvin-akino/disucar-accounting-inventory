import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role === "CUSTOMER") redirect("/orders");
  if (role === "WAREHOUSE") redirect("/warehouse");
  redirect("/orders");
}
