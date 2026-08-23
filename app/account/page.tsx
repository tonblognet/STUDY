import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { ExamMatcher } from "@/components/exam-matcher";
import { AccountSavedPrograms } from "@/components/account-saved-programs";
import { UserStateStatus } from "@/components/user-state-provider";
import { programs } from "@/lib/data";
import { fullSitePath, IS_GITHUB_PAGES } from "@/lib/runtime-mode";

export const dynamic = "force-dynamic";
export const metadata = { title: "Мои данные для поступления" };

export default async function AccountPage() {
  const user = IS_GITHUB_PAGES ? null : await getChatGPTUser();
  return <div className="page-shell container">
    <div className="dashboard-head">
      <div><span className="overline">Личный кабинет</span><h1>{user ? "Мои результаты ЕГЭ" : "Локальные результаты ЕГЭ"}</h1><p>{user ? `Выполнен безопасный вход: ${user.email}` : "Сохраните несколько наборов и используйте их для прозрачного сравнения программ."}</p></div>
      {user ? <a href={chatGPTSignOutPath("/")} className="button outline-button">Выйти</a> : <a href={IS_GITHUB_PAGES ? fullSitePath("/account") : chatGPTSignInPath("/account")} className="button button-primary">Войти, чтобы сохранить профиль</a>}
    </div>
    <UserStateStatus />
    <div className="trust-warning"><b>Результаты ЕГЭ используются только для подбора внутри сервиса.</b> Они не отправляются вузам, не передаются модели ИИ и не являются заявлением о поступлении.</div>
    <ExamMatcher programs={programs}/>
    <AccountSavedPrograms programs={programs}/>
  </div>;
}
