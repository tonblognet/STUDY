import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HomeLevelChooser } from "@/components/home-level-chooser";
import { getCatalog } from "@/lib/catalog/server";
import { homeEducationPaths, homeTuitionExample } from "@/lib/home-content";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: { absolute: "Поступай — твой следующий шаг в образовании" },
  description:
    "Колледж, бакалавриат, специалитет, магистратура и научная подготовка. Выбирайте программы, сравнивайте условия поступления и проверяйте официальные источники.",
};

const steps = [
  {
    title: "Выберите уровень",
    description: "Найдите подходящий следующий шаг.",
  },
  {
    title: "Изучите условия",
    description: "Сопоставьте форму, места и стоимость.",
  },
  { title: "Сверьтесь с вузом", description: "Проверьте сроки и документы." },
];

export default async function HomePage() {
  const catalog = await getCatalog();
  const example = homeTuitionExample(catalog);
  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={`container ${styles.heroLayout}`}>
          <div className={styles.heroCopy}>
            <h1 id="home-title">
              <span>Дальше —</span> <em>больше.</em>
            </h1>
            <p>
              Колледж, вуз или наука — выбирайте свой следующий шаг. Программы,
              условия и официальные источники в одном месте.
            </p>
            <div className={styles.heroActions}>
              <Link href="#education-levels" className={styles.primaryButton}>
                Выбрать свой путь
              </Link>
              <Link href="/universities" className={styles.secondaryButton}>
                Каталог вузов
              </Link>
            </div>
          </div>
          <div className={styles.heroArtwork} aria-hidden="true">
            <Image
              src="/illustrations/education-stairway.webp"
              alt=""
              fill
              sizes="(max-width: 760px) 100vw, 58vw"
              preload
            />
          </div>
        </div>
        <nav
          className={`container ${styles.pathRail}`}
          aria-label="Уровни образования на главной"
        >
          <ul>
            {homeEducationPaths.map((path) => (
              <li key={path.key}>
                <Link href={path.href}>
                  <span>{path.label}</span>
                  <i aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>
      <HomeLevelChooser />
      <section className={styles.sources} aria-labelledby="home-sources-title">
        <div className="container">
          <div className={styles.sourceLayout}>
            <div className={styles.sourceCopy}>
              <h2 id="home-sources-title">
                Не по слухам.
                <br />
                <em>По источникам.</em>
              </h2>
              <p>
                Стоимость, места и баллы имеют смысл вместе с годом и
                документом. Если значение пока не подтверждено, мы оставляем его
                неизвестным.
              </p>
              <Link href="/methodology" className={styles.textLink}>
                Как устроены данные
              </Link>
            </div>
            <article
              className={styles.sourceDocument}
              aria-labelledby="home-example-title"
            >
              <h3 id="home-example-title">Пример из каталога</h3>
              {example ? (
                <>
                  <p className={styles.exampleContext}>
                    Магистратура ВШЭ · {example.campus}
                  </p>
                  <h4>{example.title}</h4>
                  <p className={styles.examplePrice}>
                    {new Intl.NumberFormat("ru-RU").format(
                      example.tuition.value!,
                    )}{" "}
                    ₽ <small>/ год</small>
                  </p>
                  <dl>
                    <div>
                      <dt>Год сведений</dt>
                      <dd>{example.tuition.year}</dd>
                    </div>
                    <div>
                      <dt>Статус стоимости</dt>
                      <dd>Подтверждено</dd>
                    </div>
                  </dl>
                  <a
                    href={example.tuition.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.textLink}
                  >
                    Открыть официальный источник
                  </a>
                </>
              ) : (
                <>
                  <p className={styles.exampleUnknown}>
                    Подтверждённый пример стоимости в этой версии каталога пока
                    отсутствует.
                  </p>
                  <Link href="/methodology" className={styles.textLink}>
                    Как проверяются сведения
                  </Link>
                </>
              )}
            </article>
          </div>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className={styles.finish} aria-labelledby="home-finish-title">
        <div className="container">
          <div className={styles.finishMain}>
            <div>
              <h2 id="home-finish-title">
                Ваше дальше
                <br />
                начинается здесь.
              </h2>
              <p>Выберите путь, который подходит вам сейчас.</p>
              <Link href="#education-levels" className={styles.whiteButton}>
                Выбрать уровень образования
              </Link>
            </div>
            <div className={styles.doorway} aria-hidden="true">
              <span />
              <span />
            </div>
          </div>
          <div className={styles.examAside} id="exam-match">
            <div>
              <h3>Бакалавриат или специалитет?</h3>
              <p>Проверьте предметы и баллы по опубликованным требованиям.</p>
            </div>
            <Link href="/match">Подобрать по ЕГЭ</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
