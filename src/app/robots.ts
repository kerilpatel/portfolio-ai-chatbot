import type { MetadataRoute } from "next";

/**
 * This is a backend service, not a destination - it should not turn up in
 * search results next to the actual portfolio site.
 *
 * The root stays crawlable on purpose. `noindex` only works if the crawler is
 * allowed to fetch the page and read it; disallowing the root would hide that
 * directive, and a URL linked from anywhere else could still be listed
 * without ever being fetched. So: allow the page, let its `noindex` do the
 * work, and disallow the API paths, which there is no reason to crawl.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
  };
}
