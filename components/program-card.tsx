"use client";
import Link from "next/link";
import { useState } from "react";
import type { Program } from "@/lib/data";
import { formatPrice } from "@/lib/data";

export function ProgramCard({ program, compact = false }: { program: Program; compact?: boolean }) {
  const [favorite,setFavorite]=useState(false);
  async function toggleFavorite(){const next=!favorite;setFavorite(next);const response=await fetch("/api/favorites",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({programId:program.id,active:next})});if(!response.ok)setFavorite(!next)}
  return <article className={`program-card ${compact ? "compact" : ""}`}>
    <div className="card-top"><div className="uni-mark">{program.universityShort.slice(0, 2)}</div><div><span className="eyebrow">{program.universityShort} · {program.code}</span><h3><Link href={`/programs/${program.slug}`}>{program.title}</Link></h3></div><button className={`favorite-button ${favorite?"selected":""}`} onClick={toggleFavorite} aria-pressed={favorite} aria-label={favorite?"Удалить из избранного":"Добавить в избранное"}>{favorite?"♥":"♡"}</button></div>
    <div className="chips">{program.tags.map(tag => <span key={tag} className="chip">{tag}</span>)}<span className="chip chip-muted">{program.form}</span></div>
    <div className="subjects"><span>ЕГЭ</span>{program.subjects.join(" · ")}</div>
    <div className="card-metrics">
      <div><span>Проходной</span><strong>{program.passingScore ?? "нет данных"}</strong></div>
      <div><span>Бюджетных мест</span><strong>{program.budgetPlaces ?? "—"}</strong></div>
      <div><span>Стоимость</span><strong>{formatPrice(program.tuition)}</strong></div>
    </div>
    <div className="card-bottom"><span className={program.verified ? "verified" : "pending"}>{program.verified ? "✓ Проверено" : "◷ На проверке"} · {program.updatedAt}</span><Link href={`/programs/${program.slug}`}>Подробнее →</Link></div>
  </article>;
}
