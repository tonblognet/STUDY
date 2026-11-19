import type { Metadata } from "next";
import Link from "next/link";
import { UniversityCatalog } from "@/components/university-catalog";
import { getCatalog } from "@/lib/catalog/server";
import { universityCatalogEntries } from "@/lib/catalog/university-list";
import {
  initialView,
  universityViewSchema,
  type ViewSearch,
} from "@/lib/catalog/view-state";
import styles from "./directory.module.css";

export const metadata: Metadata = {
  title: "Вузы России",
  description:
    "Вузы и филиалы России по городам: факультеты, официальные сайты, адреса и сведения с источниками.",
};

export default async function UniversitiesPage({
  searchParams,
}: {
  searchParams: Promise<ViewSearch>;
}) {
  const params = await searchParams;
  const catalog = await getCatalog();
  const { programs, universities, directoryDetails } = catalog;
  const directoryOfferingCount = directoryDetails.reduce(
    (sum, item) => sum + item.offerings.length,
    0,
  );
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <div className={`container ${styles.mastheadInner}`}>
          <div className={styles.mastheadIntro}>
            <h1>Вузы России</h1>
            <div className={styles.mastheadCopy}>
              <p>
                Найдите вуз по названию или городу. Сверьте факультеты, адрес и
                контакты по официальным источникам.
              </p>
              <Link href="/programs">Перейти к программам</Link>
            </div>
          </div>
          <div
            className={`university-catalog-summary ${styles.metrics}`}
            role="group"
            aria-label="Сводка каталога"
          >
            <span>
              <b>{universities.length}</b> вузов и филиалов
            </span>
            <span>
              <b>{new Set(universities.map((item) => item.city)).size}</b>{" "}
              населённых пунктов
            </span>
            <span>
              <b>{programs.length}</b> программ в каталоге
            </span>
            <span>
              <b>{directoryOfferingCount}</b> направлений и профилей из перечней
              вузов
            </span>
          </div>
        </div>
      </header>
      <div className={`container ${styles.body}`}>
        <details className={styles.sources}>
          <summary>Источники и ограничения справочника</summary>
          <p>
            Справочник расширяется по региональным перечням мониторинга
            Минобрнауки 2025 и официальным сайтам вузов. Историческая запись не
            подтверждает текущий набор или лицензию. Факультеты и перечни
            направлений дополняются. Условия приёма проверяются отдельно.
            Полнота списка действующих вузов пока не подтверждена. У каждого
            сведения указан свой источник и период.
          </p>
        </details>
        <UniversityCatalog
          initialView={initialView(universityViewSchema, params)}
          entries={universityCatalogEntries(catalog)}
        />
      </div>
    </div>
  );
}
