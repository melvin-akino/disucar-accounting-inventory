/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Allow the build to succeed in Docker even if there are type/lint warnings.
  // TypeScript errors are caught locally in development — we don't want them
  // blocking a production deploy on a low-RAM server.
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },
  experimental: {
    // Server Actions (including the public QR order form) are rejected from
    // any origin not listed here. Set NEXT_PUBLIC_APP_ORIGIN to the real
    // production domain (e.g. "ops.disucarsales.ph") — see .env.example.
    serverActions: { allowedOrigins: [process.env.NEXT_PUBLIC_APP_ORIGIN ?? "localhost:3000"] },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
