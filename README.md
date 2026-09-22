# Поступай

Production-oriented платформа для выбора программ российских вузов и сопровождения абитуриента. Stage 1 сфокусирован на Москве, но доменная модель поддерживает регионы и города России без hardcode.

Главный продуктовый принцип: важное admission-значение публикуется только с годом, статусом и официальным источником. Неизвестное значение остаётся `null` и никогда не превращается в ноль.

## Что входит в Stage 1

- современный responsive landing и каталог программ/вузов;
- поиск, фильтры, избранное и сравнение;
- email/password identity, verification, reset, email 2FA и revocable sessions;
- RBAC: user, support, content manager, admin, superadmin;
- профиль абитуриента и admission tracker foundation;
- versioned provenance, quality statuses и adapter-based ingestion pipeline;
- database-driven products/entitlements и T‑Bank integration layer;
- in-app/email notification architecture и support tickets;
- admin commands with audit log;
- SEO, analytics configuration, health check, CI, Docker, monitoring and backup runbooks;
- provider-neutral AI/tool gateway and deterministic admission probability interface.

Полное наполнение всех московских вузов — самостоятельный непрерывный data-operations поток. Непроверенные факты не генерируются и не публикуются ради количества.

## Стек

Next.js 16 App Router, React 19, strict TypeScript, PostgreSQL 16, Prisma, Zod, Vitest. Архитектура — modular monolith с extractable workers/provider adapters.

Подробнее: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [DATA_SOURCES.md](DATA_SOURCES.md), [DEPLOYMENT.md](DEPLOYMENT.md), [ROADMAP.md](ROADMAP.md).

## Локальный запуск

Требования: Node.js 22+, pnpm 11+, Docker.

```bash
cp .env.example .env
docker compose up -d postgres redis mailpit
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm data:import -- --actor=editor@example.ru
pnpm dev
```

Приложение: `http://localhost:3000`. Mailpit: `http://localhost:8025`. Seed не создаёт пользователя, если явно не заданы `SEED_ADMIN_EMAIL` и сильный `SEED_ADMIN_PASSWORD`. Укажите email этого редактора в `data:import`, затем подтвердите первоначальную публикацию в `/admin/catalog`. Для просмотра без БД задайте `CATALOG_STORAGE=snapshot`; редактирование в этом режиме отключено.

## Проверки

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm security:audit
```

## Данные

Адаптеры находятся в `data-sources/universities`, orchestration — в `scripts/data-pipeline.ts`.

```bash
pnpm data:discover -- --university=hse
pnpm data:fetch -- --university=hse --year=2026
pnpm data:parse -- --university=hse --year=2026
pnpm data:validate -- --university=hse --year=2026
pnpm data:import -- --university=hse --year=2026 --dry-run
pnpm data:report
```

Импорт создаёт идемпотентный черновик с checksum и diff; отдельное подтверждение в `/admin/catalog` атомарно публикует его на сайте. Команды экспорта, редакторские исправления, откат и ограничения: [CATALOG_PUBLICATION.md](docs/CATALOG_PUBLICATION.md). Для `test:integration` нужен `TEST_DATABASE_URL` отдельной PostgreSQL БД с суффиксом `_test`; тесты создают и удаляют только собственную случайную схему.

## Production blockers

Перед боевым запуском нужны внешние ресурсы: managed PostgreSQL, доменная SMTP-конфигурация, T‑Bank merchant credentials и фискализация, monitoring destination, production analytics consent и юридическая проверка обработки персональных данных. Без них соответствующие providers fail closed.

«Поступай» — рабочее название; домен и товарные знаки проверяются отдельно до публичного запуска.

## Совместная разработка

Команда работает последовательно, по одному слою за раз. Общий план находится в [`docs/EXECUTION_PLAN.md`](docs/EXECUTION_PLAN.md), текущая передача — в [`docs/HANDOFF.md`](docs/HANDOFF.md), настройка второго Codex — в [`docs/CODEX_SETUP.md`](docs/CODEX_SETUP.md), правила GitHub — в [`docs/GITHUB_SETUP.md`](docs/GITHUB_SETUP.md).
