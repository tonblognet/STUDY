import { cookies } from "next/headers";
import Link from "next/link";
import { ExamMatcher } from "@/components/exam-matcher";
import { programs } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Мои данные для поступления" };

export default async function AccountPage() {
  const signed = Boolean((await cookies()).get("postupai_session"));
  return <div className="page-shell container"><div className="dashboard-head"><div><span className="overline">Личный кабинет</span><h1>{signed ? "Мои результаты ЕГЭ" : "Локальные результаты ЕГЭ"}</h1><p>Сохраните несколько наборов и используйте их для прозрачного сравнения программ.</p></div>{!signed && <Link href="/login" className="button button-primary">Войти, чтобы синхронизировать</Link>}</div><div className="trust-warning"><b>Сейчас наборы хранятся в этом браузере.</b> Они не отправляются вузам и не являются заявлением о поступлении.</div><ExamMatcher programs={programs}/></div>;
}
