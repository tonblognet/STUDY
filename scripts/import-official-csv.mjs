import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target) throw new Error("Usage: node scripts/import-official-csv.mjs <file-or-https-url>");
const required = ["university_slug","program_code","program_name","year","budget_places","tuition","source_url"];

async function canFetch(url) {
  const parsed = new URL(url); const robotsUrl = `${parsed.origin}/robots.txt`;
  try { const robots = await fetch(robotsUrl,{headers:{"user-agent":process.env.IMPORT_USER_AGENT??"PostupaiDataBot/1.0"}}); const body=await robots.text(); const blocks=body.split(/user-agent:/i).slice(1); return !blocks.some(block=>block.split(/user-agent:/i)[0].toLowerCase().includes("*")&&block.split(/disallow:/i).slice(1).some(line=>{const path=line.trim().split(/\s/)[0];return path&&parsed.pathname.startsWith(path)})); } catch { return false; }
}
async function load(input){if(/^https:\/\//.test(input)){if(!await canFetch(input))throw new Error("Source is unavailable or disallowed by robots.txt");await new Promise(r=>setTimeout(r,Number(process.env.IMPORT_RATE_LIMIT_MS??2000)));const response=await fetch(input,{headers:{"user-agent":process.env.IMPORT_USER_AGENT??"PostupaiDataBot/1.0"}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.text()}return readFile(resolve(input),"utf8")}
function parseCsv(text){const lines=text.replace(/^\uFEFF/,"").trim().split(/\r?\n/);const headers=lines[0].split(",").map(x=>x.trim());for(const name of required)if(!headers.includes(name))throw new Error(`Missing column: ${name}`);return lines.slice(1).map((line,index)=>{const values=line.split(",").map(x=>x.trim());const row=Object.fromEntries(headers.map((h,i)=>[h,values[i]??""]));const year=Number(row.year);if(!Number.isInteger(year)||year<2020||year>2100)throw new Error(`Row ${index+2}: invalid year`);for(const field of ["budget_places","tuition"])if(row[field]&&!Number.isFinite(Number(row[field])))throw new Error(`Row ${index+2}: invalid ${field}`);if(!/^https:\/\//.test(row.source_url))throw new Error(`Row ${index+2}: source_url must use HTTPS`);return {...row,year,budget_places:row.budget_places?Number(row.budget_places):null,tuition:row.tuition?Number(row.tuition):null,status:"REVIEW",imported_at:new Date().toISOString()}})}
const rows=parseCsv(await load(target));
console.log(JSON.stringify({ok:true,mode:"dry-run",items:rows.length,reviewRequired:true,preview:rows.slice(0,3)},null,2));
