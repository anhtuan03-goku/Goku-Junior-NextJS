import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl().origin;

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/space", "/community", "/privacy", "/photographers/"],
        disallow: ["/api/", "/admin", "/saved", "/settings"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
