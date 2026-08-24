import Link from "next/link";
import { ForgotPasswordForm } from "@/components/simple-auth-action";

export const metadata = { title: "Восстановление пароля" };
export default function ForgotPasswordPage() {
  return (
    <div className="auth-page">
      <section>
        <h1>Восстановить пароль</h1>
        <p>
          Отправим одноразовую ссылку. В целях безопасности ответ не раскрывает,
          существует ли аккаунт.
        </p>
        <ForgotPasswordForm />
        <div className="auth-links">
          <Link href="/login">Вернуться ко входу</Link>
        </div>
      </section>
      <aside>
        <b>↗</b>
        <blockquote>
          После смены пароля все активные сессии будут завершены.
        </blockquote>
        <span>Защита аккаунта</span>
      </aside>
    </div>
  );
}
