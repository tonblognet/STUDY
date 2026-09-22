import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getCatalogPublication } from "@/lib/catalog/server";
import { CatalogProgramEditor } from "@/components/catalog-program-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Редактирование условий приёма" };
export default async function ProgramEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await requireRole(["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"])))
    return (
      <div className="page-shell">
        <h1>Доступ ограничен</h1>
        <Link href="/login">Войти</Link>
      </div>
    );
  const { snapshot, revisionId } = await getCatalogPublication();
  if (!revisionId)
    return (
      <div className="page-shell">
        <h1>Редактирование недоступно в режиме снимка</h1>
      </div>
    );
  const { slug } = await params;
  const program = snapshot.programs.find((item) => item.slug === slug);
  if (!program) notFound();
  return (
    <div className="page-shell catalog-review-page">
      <Link href="/admin">← Контроль данных</Link>
      <h1>{program.title}</h1>
      <p>
        {program.university} · {program.code}
      </p>
      <CatalogProgramEditor program={program} revisionId={revisionId} />
    </div>
  );
}
