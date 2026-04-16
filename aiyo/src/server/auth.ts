import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function requireSessionUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("unauthorized");
  }
  return {
    session,
    userId,
  };
}
