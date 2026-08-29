import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { canBypassLocationLock, isIpAllowed, extractClientIp } from "@/lib/access-control";
import type { Role } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { customer: true },
        });

        if (!user || user.active === false) return null;

        const passwordMatch = await compare(credentials.password, user.passwordHash);
        if (!passwordMatch) return null;

        // Home-base login restriction (requirement #6) — off by default until an
        // admin configures at least one allowed IP/CIDR in Settings → Security.
        const org = await prisma.orgSettings.findUnique({ where: { id: "singleton" } });
        const allowlist = org?.allowedOfficeIps ?? "";
        if (allowlist && !canBypassLocationLock(user.role, user.isOwner)) {
          const ip = extractClientIp(req?.headers);
          if (!ip || !isIpAllowed(ip, allowlist)) {
            writeAudit({
              action: "user.login_blocked_location",
              entityType: "user",
              entityId: user.id,
              actorId: user.id,
              actorName: user.name,
              meta: { ip: ip ?? "unknown" },
            }).catch(() => {});
            throw new Error("LOCATION_BLOCKED");
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          customerId: user.customerId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account) {
        token.id   = user.id;
        token.role = (user as unknown as { role: Role }).role;
        token.customerId   = (user as unknown as { customerId?: string }).customerId;
        // Fire-and-forget login audit event
        writeAudit({
          action:     "user.login",
          entityType: "user",
          entityId:   user.id,
          actorId:    user.id,
          actorName:  user.name ?? undefined,
          meta:       { role: token.role },
        }).catch(() => {});
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.customerId = token.customerId as string | undefined;
      }
      return session;
    },
  },
};
