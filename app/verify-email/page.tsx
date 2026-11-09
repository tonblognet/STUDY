import Link from "next/link";
import {
  VerifyEmailAction,
  ResendVerificationForm,
} from "@/components/simple-auth-action";
export const metadata = { title: "Подтверждение email" };
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <div className="auth-page">
      <section>
        <h1>Подтверждение email</h1>
        {token && (
          <p>
            Введите пароль аккаунта. Если вы его не знаете, сначала{" "}
            <Link className="text-link" href="/forgot-password">
              задайте новый пароль
            </Link>
            , затем снова откройте ссылку из письма о подтверждении.
          </p>
        )}
        <VerifyEmailAction token={token} />
        <h2>Нужна новая ссылка?</h2>
        <ResendVerificationForm />
        <div className="auth-links">
          <Link href="/login">Перейти ко входу</Link>
        </div>
      </section>
      <aside>
        <b>✓</b>
        <blockquote>
          Подтверждённый адрес нужен для восстановления доступа и
          security-уведомлений.
        </blockquote>
        <span>Одноразовая ссылка</span>
      </aside>
    </div>
  );
}
