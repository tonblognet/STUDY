"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Brand } from "@/components/brand";

type HeaderClientProps = {
  signedIn: boolean;
  displayName?: string;
  signInPath: string;
  signOutPath: string;
};

function subscribeTheme(onChange: () => void) {
  window.addEventListener("postupai:theme", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("postupai:theme", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function HeaderClient({ signedIn, displayName, signInPath, signOutPath }: HeaderClientProps) {
  const [open, setOpen] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, () => localStorage.getItem("theme") === "dark", () => false);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const toggleTheme = () => {
    const next = !dark;
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.dispatchEvent(new Event("postupai:theme"));
  };

  const closeMenu = () => setOpen(false);

  return <header className="site-header">
    <div className="nav-wrap">
      <Brand />
      <nav id="main-navigation" className={open ? "nav-links open" : "nav-links"} aria-label="Главная навигация">
        <Link href="/programs" onClick={closeMenu}>Программы</Link>
        <Link href="/universities" onClick={closeMenu}>Вузы</Link>
        <Link href="/compare" onClick={closeMenu}>Сравнение</Link>
        <Link href="/pricing" onClick={closeMenu}>Тарифы</Link>
        <Link href="/support" onClick={closeMenu}>Поддержка</Link>
      </nav>
      <div className="nav-actions">
        <button className="icon-button" onClick={toggleTheme} aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"} suppressHydrationWarning>{dark ? "☀" : "◐"}</button>
        {signedIn ? <>
          <Link href="/account" className="button button-ghost desktop-only" title={displayName}>Кабинет</Link>
          <a href={signOutPath} className="button button-primary desktop-only">Выйти</a>
        </> : <>
          <a href={signInPath} className="button button-ghost desktop-only">Войти</a>
          <a href={signInPath} className="button button-primary desktop-only">Сохранить подбор</a>
        </>}
        <button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="main-navigation" aria-label={open ? "Закрыть меню" : "Открыть меню"}>{open ? "×" : "≡"}</button>
      </div>
    </div>
  </header>;
}
