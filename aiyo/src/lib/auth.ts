import type { DefaultSession, NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}

const providers: NextAuthOptions["providers"] = [];

if (process.env.NODE_ENV !== "production") {
  if (!process.env.NEXTAUTH_SECRET) {
    console.warn("[auth] NEXTAUTH_SECRET is missing; set it in .env.local");
  }
  if (!process.env.NEXTAUTH_URL) {
    console.warn("[auth] NEXTAUTH_URL is missing; set it in .env.local");
  }
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

providers.push(
  CredentialsProvider({
    id: "credentials",
    name: "EmailPassword",
    credentials: {
      email: { label: "電子郵件", type: "email" },
      password: { label: "密碼", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase() || "";
      const password = credentials?.password || "";

      if (!email) {
        throw new Error("MISSING_EMAIL");
      }
      if (!password) {
        throw new Error("MISSING_PASSWORD");
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      if (!user.passwordHash) {
        // User exists (e.g. Google OAuth) but does not have a local password set.
        throw new Error("PASSWORD_NOT_SET");
      }

      const { default: bcrypt } = await import("bcryptjs");
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        throw new Error("PASSWORD_INCORRECT");
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
      };
    },
  }),
);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV !== "production",
  session: {
    // Credentials provider requires JWT sessions in NextAuth v4.
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers,
  logger: {
    error(code, metadata) {
      console.error("[auth:error]", code, {
        name: metadata instanceof Error ? metadata.name : undefined,
        message: metadata instanceof Error ? metadata.message : undefined,
      });
    },
    warn(code) {
      console.warn("[auth:warn]", code);
    },
    debug(code, metadata) {
      if (process.env.NODE_ENV === "production") {
        return;
      }
      console.debug("[auth:debug]", code, {
        hasMetadata: Boolean(metadata),
      });
    },
  },
  events: {
    async signIn({ account, user, isNewUser }) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth:event] signIn", {
          provider: account?.provider,
          userId: user.id,
          isNewUser: Boolean(isNewUser),
        });
      }
    },
    async createUser({ user }) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth:event] createUser", { userId: user.id });
      }
    },
    async linkAccount({ account, user }) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth:event] linkAccount", {
          provider: account.provider,
          userId: user.id,
        });
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        // Preserve default token fields for session.user (name/email/image).
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
      }

      // NextAuth already stores a stable subject in `sub`. Use it as a fallback so
      // server routes relying on `session.user.id` don't randomly fail.
      if (!token.userId && token.sub) {
        token.userId = token.sub;
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session.user) {
        session.user.id = user?.id || token.userId || token.sub || "";
      }
      return session;
    },
    async signIn({ user, account }) {
      // Do not block OAuth sign-in on application-level bootstrap logic.
      // The app creates missing profile/trip lazily via `ensureProfile/ensureCurrentTrip` on first bootstrap.
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth] signIn callback allow", {
          provider: account?.provider,
          userId: user.id,
          hasEmail: Boolean(user.email),
        });
      }
      return Boolean(user.email);
    },
  },
};
