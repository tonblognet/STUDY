import Link from "next/link";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";

export const metadata = { title: "Вход" };

export default function Login() {
  return <div className="auth-page"><section><span className="overline">Безопасный вход</span><h1>Продолжить в Поступай</h1><p>Размещённая версия использует вход, который подтверждает личность на стороне платформы. Пароли и платёжные реквизиты не принимает и не хранит приложение.</p><div className="auth-actions"><a className="button button-primary" href={chatGPTSignInPath("/account")}>Продолжить с ChatGPT</a><Link className="button outline-button" href="/programs">Сначала посмотреть программы</Link></div><p className="auth-note">Без входа работают подбор, каталог и локальные сохранения. Вход понадобится для будущей синхронизации между устройствами.</p></section><aside><b>✓</b><blockquote>Никаких демонстрационных паролей и скрытой активации подписки.</blockquote><span>Серверная проверка пользователя</span></aside></div>;
}
