import type { Metadata } from "next";
import Link from "next/link";
import { UniversityCatalog } from "@/components/university-catalog";
import { getCatalog } from "@/lib/catalog/server";
import { directoryEvidenceSummary } from "@/lib/university-directory-details";

export const metadata: Metadata = {
  title: "Вузы Москвы",
  description:
    "Государственные и негосударственные вузы Москвы: официальные сайты, логотипы, адреса и сведения об организациях.",
};

export default async function UniversitiesPage() {
  const { programs, universities, directoryDetails, admissionCampaigns } =
    await getCatalog();
  const getDirectoryDetails = (slug: string) =>
    directoryDetails.find((item) => item.universitySlug === slug);
  const getAdmissionCampaign = (slug: string) =>
    admissionCampaigns.find((item) => item.universitySlug === slug);
  const directoryOfferingCount = directoryDetails.reduce(
    (sum, item) => sum + item.offerings.length,
    0,
  );
  return (
    <div className="page-shell container">
      <div className="page-title">
        <span className="overline">Каталог университетов</span>
        <h1>Вузы Москвы</h1>
        <p className="editorial-lead">
          Найдите университет и узнайте о нём главное: официальный сайт, адрес,
          тип организации и контакты. Сведения сопровождаются источниками.
        </p>
      </div>
      <div className="university-catalog-summary" aria-label="Сводка каталога">
        <span>
          <b>{universities.length}</b> вуза и филиала
        </span>
        <span>
          <b>{programs.length}</b> программ в каталоге
        </span>
        <span>
          <b>{directoryOfferingCount}</b> направлений и профилей из перечней
          вузов
        </span>
        <Link href="/programs">Перейти к программам →</Link>
      </div>
      <p className="university-directory-note">
        Каталог расширен по московскому перечню Минобрнауки и официальным
        сайтам. Перечни направлений дополняются; условия приёма проверяются
        отдельно. МФТИ из Московской области сохранён в каталоге с указанием
        города. Полнота списка действующих вузов и текущие статусы лицензий пока
        не подтверждены. Дата выписки о лицензии относится к документу, а не к
        сегодняшнему статусу организации.
      </p>
      <UniversityCatalog
        entries={universities.map((university) => ({
          ...university,
          campaignCount:
            getAdmissionCampaign(university.slug)?.groups.length ?? 0,
          evidence: directoryEvidenceSummary(
            getDirectoryDetails(university.slug),
          ),
          offeringCount:
            getDirectoryDetails(university.slug)?.offerings.length ?? 0,
          catalogProgramCount: programs.filter(
            (program) => program.universitySlug === university.slug,
          ).length,
        }))}
      />
    </div>
  );
}
