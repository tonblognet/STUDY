import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <div className="auth-page">
      <section>
        <h1>Войдите в свой маршрут</h1>
        <p>
          Избранное, сравнение, профиль ЕГЭ и трекер поступления
          синхронизируются между устройствами.
        </p>
        <AuthForm mode="login" />
        <div className="auth-links">
          <Link href="/forgot-password">Забыли пароль?</Link>
          <Link href="/register">Создать аккаунт</Link>
        </div>
      </section>
      <aside>
        <b>01</b>
        <blockquote>
          Все решения по поступлению остаются в одном спокойном рабочем
          пространстве.
        </blockquote>
        <span>Сессии можно завершить на всех устройствах</span>
      </aside>
    </div>
  );
}
