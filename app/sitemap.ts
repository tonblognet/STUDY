import type { MetadataRoute } from "next";
import { programs, universities } from "@/lib/data";
import { getSiteBaseUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (await getSiteBaseUrl()).toString().replace(/\/$/, "");
  const pages: MetadataRoute.Sitemap = ["", "/programs", "/universities", "/pricing", "/methodology", "/support", "/privacy", "/about"].map(path => ({ url: base + path, lastModified: new Date(), changeFrequency: path === "" ? "daily" : "weekly", priority: path === "" ? 1 : 0.8 }));
  const programPages: MetadataRoute.Sitemap = programs.map(program => ({ url: `${base}/programs/${program.slug}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 }));
  const universityPages: MetadataRoute.Sitemap = universities.map(university => ({ url: `${base}/universities/${university.slug}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 }));
  return [...pages, ...programPages, ...universityPages];
}
