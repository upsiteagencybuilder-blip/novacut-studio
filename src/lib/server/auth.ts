import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

/**
 * Day 48 — OPTIONAL auth scaffolding.
 *
 * The editor is local-first and fully usable signed out (deviceId-scoped
 * cloud rows). Sign-in exists to LINK a device to an account so a future
 * iteration can scope cloud data across devices. Local-first never breaks:
 * every cloud route keeps working with deviceId alone.
 *
 * Providers:
 *  • Credentials — a display-name identity for the scaffold + local E2E.
 *  • GitHub/Google activate automatically ONLY when their env vars exist
 *    (production can turn them on without code changes).
 */

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Display name (scaffolding)',
      credentials: {
        name: { label: 'Display name', type: 'text', placeholder: 'How should we call you?' },
      },
      async authorize(credentials) {
        const name = credentials?.name?.trim()
        if (!name || name.length < 2 || name.length > 40) return null
        // deterministic sub from the name keeps the scaffold stateless
        const id = `local-${Buffer.from(name).toString('base64url').slice(0, 18)}`
        return { id, name }
      },
    }),
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        [require('next-auth/providers/github').default({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET })]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        [require('next-auth/providers/google').default({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub as string
      }
      return session
    },
  },
}
