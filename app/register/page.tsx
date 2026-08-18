import Link from "next/link";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";

export const metadata = { title: "Сохранить подбор" };

export default function Register() {
  return <div className="auth-page"><section><span className="overline">Сохранение результатов</span><h1>Соберите свой маршрут</h1><p>В текущей размещённой версии отдельная регистрация по паролю отключена: это исключает небезопасный демонстрационный вход.</p><div className="auth-actions"><a className="button button-primary" href={chatGPTSignInPath("/account")}>Продолжить с ChatGPT</a><Link className="button outline-button" href="/programs">Открыть каталог</Link></div><p className="auth-note">Полноценная публичная регистрация по электронной почте будет подключаться только вместе с подтверждением адреса, восстановлением пароля и постоянным хранилищем сессий.</p></section><aside><b>01</b><blockquote>Сначала безопасная идентификация, затем синхронизация избранного и результатов ЕГЭ.</blockquote><span>Без фиктивных аккаунтов</span></aside></div>;
}
