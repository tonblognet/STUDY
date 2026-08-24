import { ResetPasswordForm } from "@/components/simple-auth-action";
export const metadata = { title: "Новый пароль" };
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <div className="auth-page">
      <section>
        <h1>Новый пароль</h1>
        <p>Используйте уникальную фразу длиной не менее 12 символов.</p>
        <ResetPasswordForm token={token} />
      </section>
      <aside>
        <b>12+</b>
        <blockquote>
          Надёжный пароль и двухэтапный вход защищают ваш маршрут поступления.
        </blockquote>
        <span>Пароли хранятся только в виде hash</span>
      </aside>
    </div>
  );
}
