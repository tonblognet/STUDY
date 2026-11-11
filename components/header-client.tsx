"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";

export function HeaderClient({
  signedIn,
  displayName,
}: {
  signedIn: boolean;
  displayName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    navigation.current
      ?.querySelector<HTMLAnchorElement>("a[href]")
      ?.focus({ preventScroll: true });
    const desktop = window.matchMedia("(min-width: 761px)");
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus({ preventScroll: true });
      }
    }
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", onKey);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pathname = usePathname();
  const links = [
    ["/universities", "Вузы"],
    ["/programs", "Программы"],
    ["/match", "Подбор по ЕГЭ"],
    ["/compare", "Сравнение"],
    ["/methodology", "Как это работает"],
    ["/faq", "FAQ"],
  ] as const;

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Brand />
        <nav
          ref={navigation}
          id="main-navigation"
          className={open ? "nav-links open" : "nav-links"}
          aria-label="Главная навигация"
        >
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link
            className="mobile-nav-account"
            href={signedIn ? "/account" : "/login"}
            onClick={() => setOpen(false)}
          >
            {signedIn ? "Личный кабинет" : "Войти"}
          </Link>
        </nav>
        <div className="nav-actions">
          <Link
            href={signedIn ? "/account" : "/login"}
            className="login-link"
            title={displayName ?? undefined}
          >
            {signedIn ? "Кабинет" : "Войти"}
          </Link>
          <Link href="/match" className="button button-primary nav-cta">
            Подобрать программу
          </Link>
          <button
            ref={menuButton}
            className="menu-button"
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="main-navigation"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
