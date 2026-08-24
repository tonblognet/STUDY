import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return (
    <div className="auth-page">
      <section>
        <h1>Соберите свой маршрут</h1>
        <p>
          Сохраняйте программы, расставляйте приоритеты и не теряйте важные
          даты. После регистрации подтвердите адрес электронной почты.
        </p>
        <AuthForm mode="register" />
        <div className="auth-links">
          <span>Уже есть аккаунт?</span>
          <Link href="/login">Войти</Link>
        </div>
      </section>
      <aside>
        <b>02</b>
        <blockquote>
          Мы собираем только те данные, которые нужны для выбора и сопровождения
          поступления.
        </blockquote>
        <span>Privacy by design</span>
      </aside>
    </div>
  );
}
