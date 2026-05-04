import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function requireSessionUser() {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (error) {
    // NextAuth can throw during JWT decode/session construction (secret drift,
    // corrupted cookie). Treat as needing a fresh login instead of a 500.
    if (process.env.NODE_ENV !== "production") {
      console.error("[auth] getServerSession failed:", error);
    }
    throw new Error("unauthorized");
  }

  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("unauthorized");
  }
  return {
    session,
    userId,
  };
}
