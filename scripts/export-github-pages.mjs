import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const basePath = "/STUDY";
const localOrigin = process.env.PAGES_EXPORT_ORIGIN ?? "http://127.0.0.1:3000";
const outputDir = resolve("pages-dist");
const clientDir = resolve("dist/client");
const fontsDir = resolve(".vinext/fonts");

const navigationGuard = `<script data-github-pages-navigation>document.addEventListener("click",function(event){var anchor=event.target.closest&&event.target.closest("a");if(!anchor||anchor.target||anchor.hasAttribute("download"))return;var target=new URL(anchor.href,window.location.href);if(target.origin===window.location.origin&&target.pathname.indexOf("${basePath}/")===0&&!target.hash){event.stopImmediatePropagation();}},true);</script>`;

async function fetchText(pathname, expectedType) {
  let response;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      response = await fetch(`${localOrigin}${basePath}${pathname}`);
      break;
    } catch (error) {
      if (attempt === 20) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  if (!response) throw new Error(`${pathname} could not be fetched`);
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (expectedType && !contentType.includes(expectedType)) {
    throw new Error(`${pathname} returned ${contentType || "an unknown content type"}`);
  }
  return response.text();
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function rewriteHtml(html) {
  return html
    .replace(/url\([^)]*?\.vinext\/fonts\//g, `url(${basePath}/fonts/`)
    .replace("</head>", `${navigationGuard}</head>`);
}

function outputFileForRoute(route) {
  if (route === "/") return resolve(outputDir, "index.html");
  return resolve(outputDir, route.replace(/^\//, ""), "index.html");
}

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(clientDir, outputDir, { recursive: true });

  try {
    await access(fontsDir);
    await cp(fontsDir, resolve(outputDir, "fonts"), { recursive: true });
  } catch {
    // The site keeps a system-font fallback if the build has no downloaded fonts.
  }

  const sitemap = await fetchText("/sitemap.xml", "xml");
  const routes = new Set(["/", "/compare", "/account", "/login", "/register"]);
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const pathname = new URL(decodeXml(match[1])).pathname;
    const route = pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
    routes.add(route.replace(/\/$/, "") || "/");
  }

  for (const route of [...routes].sort()) {
    const html = rewriteHtml(await fetchText(route === "/" ? "/" : route, "text/html"));
    const file = outputFileForRoute(route);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  }

  await writeFile(resolve(outputDir, "sitemap.xml"), sitemap);
  await writeFile(resolve(outputDir, "robots.txt"), await fetchText("/robots.txt", "text/plain"));
  await writeFile(resolve(outputDir, ".nojekyll"), "");
  await cp(resolve(outputDir, "index.html"), resolve(outputDir, "404.html"));

  const exported = [...routes].sort();
  await writeFile(resolve(outputDir, "export-manifest.json"), `${JSON.stringify({ basePath, routes: exported }, null, 2)}\n`);
  const index = await readFile(resolve(outputDir, "index.html"), "utf8");
  if (!index.includes(`${basePath}/assets/`) || !index.includes("Поступай")) {
    throw new Error("The exported home page is missing its prefixed assets or product content");
  }
  console.log(`Exported ${exported.length} routes to ${outputDir}`);
}

await main();
