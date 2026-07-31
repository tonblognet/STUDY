import type { Metadata } from "next";
import Link from "next/link";
import { universities } from "@/lib/data";

export const metadata: Metadata = { title: "Вузы Москвы", description: "Каталог московских университетов и их образовательных программ." };
export default function UniversitiesPage() { return <div className="page-shell container"><div className="page-title"><span className="overline">Проверенный каталог</span><h1>Вузы Москвы</h1><p>Официальные источники, программы и ключевые условия поступления.</p></div><div className="university-grid">{universities.map(u => <article className="university-card" key={u.id}><div className="university-logo" style={{background:u.color}}>{u.shortName.slice(0,1)}</div><div><span>{u.shortName}</span><h2>{u.name}</h2><p>{u.description}</p></div><div className="university-meta"><span>{u.programsCount} программ</span><span>Москва</span><Link href={`/universities/${u.slug}`}>Открыть вуз →</Link></div></article>)}</div></div> }
