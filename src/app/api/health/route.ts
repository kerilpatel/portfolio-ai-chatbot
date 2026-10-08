import { NextResponse } from "next/server";

import { health } from "@/lib/health";

/**
 * A cached health response would report stale status, which is worse than no
 * probe at all. GET handlers are uncached by default today, but this pins it
 * so enabling Cache Components later cannot silently prerender it.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(health(process.uptime()));
}
