import type { MetadataRoute } from "next";
import { programs, universities } from "@/lib/data";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://postupai.example";
  const pages: MetadataRoute.Sitemap = ["", "/programs", "/universities", "/pricing"].map(path => ({ url: base + path, lastModified: new Date(), changeFrequency: "daily", priority: path === "" ? 1 : 0.8 }));
  const programPages: MetadataRoute.Sitemap = programs.map(program => ({ url: `${base}/programs/${program.slug}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 }));
  const universityPages: MetadataRoute.Sitemap = universities.map(university => ({ url: `${base}/universities/${university.slug}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 }));
  return [...pages, ...programPages, ...universityPages];
}
