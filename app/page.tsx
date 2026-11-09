import Link from "next/link";
import { HeroDataViz } from "@/components/hero-data-viz";
import { getCatalog } from "@/lib/catalog/server";
import { formatPrice } from "@/lib/catalog/format";
import styles from "./home.module.css";

const comparisonLabels = [
  "Форма",
  "Бюджет",
  "Проходной",
  "Стоимость",
  "Статус",
];
const numberFormat = new Intl.NumberFormat("ru-RU");

export default async function HomePage() {
  const { programs, universities } = await getCatalog();
  const budgetPlaces = programs.reduce(
    (sum, program) => sum + (program.budgetPlaces ?? 0),
    0,
  );
  const chartPrograms = programs
    .filter((program) => program.budgetPlaces !== null)
    .slice(0, 7);
  const subjects = [
    ...new Set(
      programs.flatMap((program) =>
        program.subjects.map((subject) => subject.split(" /")[0] ?? subject),
      ),
    ),
  ];
  const comparable = programs
    .filter(
      (program) =>
        program.budgetPlaces !== null || program.passingScore !== null,
    )
    .slice(0, 3);

  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={`container ${styles.heroLayout}`}>
          <div className={styles.heroCopy}>
            <h1>Поступление начинается с ясного выбора</h1>
            <p>
              Собрали справочник вузов России и проверенную выборку программ
              Москвы — чтобы вы сравнивали варианты и открывали официальные
              источники без десятков вкладок.
            </p>
            <div className={styles.actions}>
              <Link href="/programs" className="button button-primary">
                Найти свою программу
              </Link>
              <Link href="/#exam-match" className="button button-secondary">
                Подобрать по ЕГЭ
              </Link>
            </div>
          </div>
          <HeroDataViz
            points={chartPrograms.map((program) => ({
              id: program.id,
              label: program.universityShort,
              title: program.title,
              value: program.budgetPlaces ?? 0,
            }))}
            subjects={
              subjects.length
                ? subjects
                : ["Математика", "Русский язык", "Информатика"]
            }
          />
        </div>
        <div className={`container ${styles.stats}`}>
          <dl>
            <div>
              <dt>Вузы и филиалы</dt>
              <dd>{numberFormat.format(universities.length)}</dd>
            </div>
            <div>
              <dt>Программы в подборе</dt>
              <dd>{numberFormat.format(programs.length)}</dd>
            </div>
            <div>
              <dt>Бюджетные места по опубликованным данным</dt>
              <dd>
                {chartPrograms.length ? numberFormat.format(budgetPlaces) : "—"}
              </dd>
            </div>
          </dl>
          <Link href="/universities" className={styles.directoryLink}>
            Открыть каталог вузов <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section className={styles.comparison}>
        <div className="container">
          <div className={styles.sectionIntro}>
            <div>
              <h2>Спокойно сравните всё важное</h2>
              <p>
                Посмотрите форму обучения, бюджетные места, прошлый проходной
                балл и стоимость. Откройте программу, чтобы сверить источник.
              </p>
            </div>
            <Link href="/compare" className="text-link">
              Открыть сравнение
            </Link>
          </div>
          <div
            className={styles.table}
            role="region"
            aria-label="Пример сравнения программ"
          >
            <div
              className={`${styles.comparisonRow} ${styles.tableHead}`}
              aria-hidden="true"
            >
              <span>Вуз и программа</span>
              {comparisonLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {comparable.map((program) => (
              <Link
                className={styles.comparisonRow}
                href={`/programs/${program.slug}`}
                key={program.id}
              >
                <span className={styles.programTitle}>
                  <b>{program.title}</b>
                  <small>
                    {program.universityShort}, {program.code}
                  </small>
                </span>
                {[
                  program.form,
                  program.budgetPlaces ?? "—",
                  program.passingScore ?? "—",
                  formatPrice(program.tuition),
                  <span
                    key="quality"
                    className={`quality-dot ${program.trust.status}`}
                  >
                    {program.trust.status === "verified"
                      ? "Проверено"
                      : "На проверке"}
                  </span>,
                ].map((value, index) => (
                  <span
                    key={comparisonLabels[index]}
                    className={styles.comparisonValue}
                  >
                    <span className={styles.valueLabel}>
                      {comparisonLabels[index]}
                    </span>
                    <span>{value}</span>
                  </span>
                ))}
              </Link>
            ))}
            {comparable.length === 0 && (
              <p>Данные для примера пока уточняются.</p>
            )}
          </div>
        </div>
      </section>

      <section className={styles.exam} id="exam-match">
        <div className={`container ${styles.examLayout}`}>
          <div>
            <h2>Начните с того, что уже знаете</h2>
            <p>
              Укажите предметы ЕГЭ и ожидаемые баллы. Мы покажем программы, где
              набор испытаний совпадает, и отдельно отметим неопубликованные
              условия.
            </p>
            <Link href="/match" className={`button ${styles.examButton}`}>
              Подобрать варианты
            </Link>
          </div>
          <ol>
            <li>
              <b aria-hidden="true">1</b>
              <span>
                <strong>Добавьте предметы</strong>
                <small>Обязательные и возможные альтернативы</small>
              </span>
            </li>
            <li>
              <b aria-hidden="true">2</b>
              <span>
                <strong>Сравните условия</strong>
                <small>Места, стоимость и проходные баллы по годам</small>
              </span>
            </li>
            <li>
              <b aria-hidden="true">3</b>
              <span>
                <strong>Сохраните маршрут</strong>
                <small>Избранное, приоритеты и дедлайны</small>
              </span>
            </li>
          </ol>
        </div>
      </section>

      <section className={styles.sources}>
        <div className={`container ${styles.sourceLayout}`}>
          <div>
            <h2>Каждое важное число можно проверить</h2>
            <p>
              Мы сохраняем год, дату проверки, документ и точное место в
              источнике. Если университет ещё не опубликовал значение, интерфейс
              честно показывает «нет данных».
            </p>
          </div>
          <div>
            <ol className={styles.sourceFlow}>
              <li>Находим официальный документ</li>
              <li>Сверяем значение и год</li>
              <li>Публикуем со ссылкой</li>
            </ol>
            <Link href="/methodology" className="text-link">
              Как устроены данные
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
