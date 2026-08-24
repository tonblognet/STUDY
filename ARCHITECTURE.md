# Архитектура «Поступай»

## Контекст

«Поступай» — SEO-дружественная платформа для выбора программ российских вузов и сопровождения абитуриента. Первая область наполнения — Москва, но город не является ограничением доменной модели. Ключевые качества системы: доказуемое происхождение данных, безопасность персональных данных, воспроизводимые импорты и понятный интерфейс.

## Архитектурный стиль

Проект — модульный монолит на Next.js. HTTP/UI, прикладные сервисы и persistence развёртываются единым приложением, а тяжёлые операции выполняются отдельным worker-процессом из того же репозитория. Boundaries `catalog`, `identity`, `admissions`, `billing`, `notifications`, `support`, `analytics`, `ai` не импортируют инфраструктурные SDK напрямую.

```text
Browser / crawler
       │
Next.js routes ── server actions/API ── application services
                                      │
                ┌─────────────────────┼──────────────────────┐
                │                     │                      │
           PostgreSQL             Job queue             Provider ports
         domain + outbox       import/notify/pay       email/payments/AI
```

## Стек

- Frontend/backend: Next.js 16 App Router, React 19, TypeScript strict.
- UI: собственная token-based design system, server components по умолчанию, client components только для состояния.
- Database: PostgreSQL 16, Prisma ORM, версионируемые SQL migrations.
- Identity: email/password, `bcrypt`-совместимый `bcryptjs`, opaque database sessions in `HttpOnly` cookies, one-time hashed verification/reset/2FA tokens.
- Validation: Zod на каждой границе ввода.
- Queue: интерфейс `JobQueue`; production adapter может использовать Redis/BullMQ или managed queue. Domain не зависит от реализации.
- Cache: Next.js data cache для публичных снимков; Redis-ready интерфейс для rate limits, locks и горячих поисковых запросов.
- Payments: provider port + T‑Bank adapter; webhook — единственный источник активации подписки.
- Email/notifications: transactional outbox + provider adapters; dev adapter пишет сообщения в Mailpit.
- Analytics: first-party event contract, optional Yandex Metrica only after consent.
- AI: permission-scoped tool gateway; AI provider не получает unrestricted DB access.

## Модули и зависимости

- `catalog`: вузы, кампусы, программы, кампании, экзамены, цены, места, provenance.
- `ingestion`: discover → fetch → parse → normalize → validate → diff → review → publish.
- `identity`: пользователи, сессии, verification, password reset, email 2FA, RBAC.
- `admissions`: профиль абитуриента, избранное, сравнение, tracker и deterministic probability port.
- `billing`: продукты, цены, entitlements, платежи, возвраты, reconciliation.
- `notifications`: preferences, in-app, email и будущий Telegram adapter.
- `support`: tickets, messages, attachments metadata и SLA states.
- `admin`: backend-enforced commands, audit trail, destructive-action confirmation.
- `ai`: provider-neutral completion port и whitelisted tools.

Правило зависимостей: UI → application → domain; infrastructure реализует domain/application ports. Domain не импортирует Next.js, Prisma, T‑Bank или AI SDK.

## Данные и консистентность

Публикуемое значение содержит campaign year, validity interval, source artifact, checked time, reliability, parser version и status. Неизвестное значение — `null`, не `0`. Изменение создаёт новую версию `MetricValue`; подозрительный diff остаётся на review. Импорты и webhooks имеют idempotency key, транзакционную запись и блокировку конкурентного запуска.

## Поиск

На первом этапе — PostgreSQL indexes и полнотекстовый поиск по нормализованным названиям. API использует cursor pagination. При росте корпуса search port можно перевести на отдельный движок без изменения UI/domain.

## Авторизация

RBAC роли: `USER`, `SUPPORT`, `CONTENT_MANAGER`, `ADMIN`, `SUPERADMIN`. Проверка выполняется в application service для каждой команды. Entitlements отделены от названия тарифа. Обычный администратор не может менять superadmin. Audit logs append-only на уровне приложения и отдельного DB grant.

## Background jobs

Долгие операции не выполняются в пользовательском request: импорт, PDF parsing, отправка email, notifications, payment reconciliation, агрегации и scoring идут через queue. Job handler обязан быть idempotent и повторяем.

## Наблюдаемость

Структурированные JSON logs содержат request/job id, severity и безопасный context. Пароли, токены, полные payload платежа и персональные профили не логируются. Отдельно собираются errors, metrics, traces и product analytics.

## Тестирование

- Unit: validation, matching, entitlements, permissions, token/payment signatures.
- Integration: repository + PostgreSQL, route boundaries, migrations, idempotency.
- Component: критические интерактивные элементы каталога и кабинета.
- E2E: auth, password reset, tracker, checkout/webhook, admin authorization.
- Security: cross-user access, role escalation, invalid origin, forged webhook, subscription bypass.

## Масштабирование

Сначала масштабируются stateless web replicas, PostgreSQL read replicas/cache и workers. Отдельными сервисами могут стать ingestion, notifications, AI gateway и scoring — их границы уже выражены портами и job contracts. Kafka/Kubernetes не вводятся без измеримой необходимости.
