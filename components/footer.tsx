import Link from "next/link";
import { Brand } from "@/components/brand";

export function Footer() {
  return <footer className="footer"><div className="footer-grid">
    <div><Brand /><p>Проверенные данные о поступлении в московские вузы — без десятков вкладок.</p></div>
    <div><strong>Поступление</strong><Link href="/programs">Программы</Link><Link href="/universities">Вузы</Link><Link href="/pricing">Тарифы</Link></div>
    <div><strong>Сервис</strong><Link href="/about">О проекте</Link><Link href="/methodology">Методология данных</Link><Link href="/support">Поддержка</Link><Link href="/privacy">Конфиденциальность</Link></div>
    <div><strong>Важно</strong><p>Данные носят справочный характер. Перед подачей документов сверяйтесь с сайтом вуза.</p></div>
  </div><div className="footer-bottom"><span>© 2026 Поступай</span><span>Москва · обновления публикуются после проверки</span></div></footer>;
}
