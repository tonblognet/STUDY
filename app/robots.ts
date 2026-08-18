import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/lib/site-url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = (await getSiteBaseUrl()).toString().replace(/\/$/, "");
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/account/", "/api/"] }], sitemap: `${base}/sitemap.xml` };
}
