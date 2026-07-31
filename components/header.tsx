"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function Header() {
  const [dark, setDark] = useState(() => typeof window !== "undefined" && localStorage.getItem("theme") === "dark");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.dataset.theme = next ? "dark" : "light";
  };
  return <header className="site-header">
    <div className="nav-wrap">
      <Link href="/" className="brand" aria-label="Поступай — главная"><span>П</span>Поступай</Link>
      <nav className={open ? "nav-links open" : "nav-links"} aria-label="Главная навигация">
        <Link href="/programs">Программы</Link><Link href="/universities">Вузы</Link><Link href="/compare">Сравнение</Link><Link href="/pricing">Тарифы</Link>
      </nav>
      <div className="nav-actions">
        <button className="icon-button" onClick={toggleTheme} aria-label="Переключить тему" suppressHydrationWarning>{dark ? "☀" : "◐"}</button>
        <Link href="/login" className="button button-ghost desktop-only">Войти</Link>
        <Link href="/register" className="button button-primary desktop-only">Начать бесплатно</Link>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Открыть меню">{open ? "×" : "≡"}</button>
      </div>
    </div>
  </header>;
}
