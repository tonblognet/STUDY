import Link from "next/link";
import { HeroDataViz } from "@/components/hero-data-viz";
import { getCatalog } from "@/lib/catalog/server";
import { formatPrice } from "@/lib/catalog/format";

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
    <>
      <section className="new-hero">
        <div className="container hero-layout">
          <div className="hero-copy">
            <h1>Поступление начинается с ясного выбора</h1>
            <p>
              Собрали программы московских вузов, требования и официальные
              источники — чтобы вы сравнивали варианты без десятков вкладок.
            </p>
            <div className="hero-actions">
              <Link href="/programs" className="button button-primary">
                Найти свою программу
              </Link>
              <Link href="/#exam-match" className="button button-secondary">
                Подобрать по ЕГЭ
              </Link>
            </div>
            <dl className="hero-stats">
              <div>
                <dt>Вузы Москвы</dt>
                <dd>{universities.length}</dd>
              </div>
              <div>
                <dt>Программы</dt>
                <dd>{programs.length}</dd>
              </div>
              <div>
                <dt>Бюджетные места</dt>
                <dd>{budgetPlaces}</dd>
              </div>
            </dl>
            <p className="hero-footnote">
              Только опубликованные значения текущей проверенной выборки.
              Неподтверждённые данные не считаются.
            </p>
          </div>
          <HeroDataViz
            points={chartPrograms.map((program) => ({
              label: program.universityShort,
              value: program.budgetPlaces ?? 0,
            }))}
            subjects={
              subjects.length
                ? subjects
                : ["Математика", "Русский язык", "Информатика"]
            }
          />
        </div>
      </section>

      <section className="comparison-preview">
        <div className="container">
          <div className="section-intro">
            <div>
              <h2>Спокойно сравните всё важное</h2>
              <p>
                В одной строке — экзамены, места, исторический ориентир,
                стоимость и точный источник.
              </p>
            </div>
            <Link href="/compare" className="text-link">
              Открыть сравнение <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div
            className="open-table"
            role="region"
            aria-label="Пример сравнения программ"
            tabIndex={0}
          >
            <div className="open-table-row table-head">
              <span>Вуз и программа</span>
              <span>Форма</span>
              <span>Бюджет</span>
              <span>Проходной</span>
              <span>Стоимость</span>
              <span>Статус</span>
            </div>
            {comparable.map((program) => (
              <Link
                className="open-table-row"
                href={`/programs/${program.slug}`}
                key={program.id}
              >
                <span>
                  <b>{program.title}</b>
                  <small>
                    {program.universityShort} · {program.code}
                  </small>
                </span>
                <span>{program.form}</span>
                <span>{program.budgetPlaces ?? "—"}</span>
                <span>{program.passingScore ?? "—"}</span>
                <span>{formatPrice(program.tuition)}</span>
                <span className={`quality-dot ${program.trust.status}`}>
                  {program.trust.status === "verified"
                    ? "Проверено"
                    : "На проверке"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="exam-section" id="exam-match">
        <div className="container exam-layout">
          <div>
            <h2>Начните с того, что уже знаете</h2>
            <p>
              Укажите предметы ЕГЭ и ожидаемые баллы. Мы покажем программы, где
              набор испытаний совпадает, и отдельно отметим неопубликованные
              условия.
            </p>
            <Link href="/programs" className="button button-primary">
              Подобрать варианты
            </Link>
          </div>
          <ol>
            <li>
              <b>01</b>
              <span>
                <strong>Добавьте предметы</strong>
                <small>Обязательные и возможные альтернативы</small>
              </span>
            </li>
            <li>
              <b>02</b>
              <span>
                <strong>Сравните условия</strong>
                <small>Места, стоимость и проходные баллы по годам</small>
              </span>
            </li>
            <li>
              <b>03</b>
              <span>
                <strong>Сохраните маршрут</strong>
                <small>Избранное, приоритеты и дедлайны</small>
              </span>
            </li>
          </ol>
        </div>
      </section>

      <section className="source-section">
        <div className="container source-layout">
          <div>
            <h2>Каждое важное число можно проверить</h2>
            <p>
              Мы сохраняем год, дату проверки, документ и точное место в
              источнике. Если университет ещё не опубликовал значение, интерфейс
              честно показывает «нет данных».
            </p>
          </div>
          <div className="source-flow">
            <span>Официальный источник</span>
            <i>→</i>
            <span>Проверка и история</span>
            <i>→</i>
            <span>Публикация</span>
          </div>
          <Link href="/methodology" className="text-link">
            Как устроены данные →
          </Link>
        </div>
      </section>
    </>
  );
}
