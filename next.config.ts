import type { NextConfig } from "next";

/**
 * Baseline response headers for every route.
 *
 * Deliberately excludes Cross-Origin-Resource-Policy and the COEP/COOP pair.
 * The whole point of this service is to be fetched from another origin, and
 * those headers exist to restrict exactly that - the CORS allowlist in
 * `src/lib/cors.ts` is where cross-origin access is decided.
 */
const securityHeaders = [
  // JSON responses must never be sniffed as something executable.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing here is meant to be framed, and an API host never needs to be.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't pass this host's URL on to anywhere the page might link.
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
