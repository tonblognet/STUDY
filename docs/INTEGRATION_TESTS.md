# Интеграционные проверки

Для `pnpm test:integration` нужна отдельная PostgreSQL 16 с именем БД на
`_test`, кодировкой сервера **UTF8** и часовым поясом подключения **UTC**.
БД в WIN1251 не может сохранить, например, символ «₽». UTC — общая настройка
набора тестов и приложения: часть старых столбцов Prisma хранит время UTC
в `TIMESTAMP` без зоны, а их SQL defaults используют время сеанса. Тест
миграции аккаунта и проверка rate limiter намеренно меняют пояс на
`Europe/Moscow` только внутри своих транзакций.

## Подготовка БД в работающем локальном кластере

Скрипт [create-integration-db.sql](../scripts/create-integration-db.sql)
создаёт новую БД из `template0` (UTF8, ICU `ru-RU`), задаёт UTC только новой
БД и проверяет результат через новое подключение. Если имя уже занято, скрипт
только проверяет настройки. Если старая БД несовместима, выберите другое
свободное имя на `_test`. Скрипт не меняет и не удаляет существующие БД.
Нужны PostgreSQL с ICU и локальная тестовая роль с правом `CREATEDB`;
эта роль становится владельцем новой БД.

Из корня проекта с `psql` 16:

```powershell
psql -X -h 127.0.0.1 -p 5432 -U postupai -d postgres -v test_db=postupai_test -f scripts/create-integration-db.sql
```

Для изолированного кластера слоя 04 укажите порт `55432`, локальную роль
`postupai_test` и `-v test_db=postupai_layer04_test`. Оставьте
`postupai_layer01_test` в исходном состоянии. Для локального Docker команда
без установленного на хосте `psql` (PowerShell):

```powershell
Get-Content -Raw scripts/create-integration-db.sql | docker compose exec -T postgres psql -X -U postupai -d postgres
```

Задайте `TEST_DATABASE_URL` в окружении процесса (пример в
[.env.example](../.env.example)), укажите в нём созданную БД. Для
интеграционного запуска задайте `DATABASE_URL` тем же тестовым адресом.
Используйте только локальные тестовые учётные данные и не печатайте URL
с паролем в логах. DB-тесты сами применяют миграции в отдельных случайных
схемах и удаляют только эти схемы; seed и предварительный deploy миграций не
нужны.

```powershell
$env:DATABASE_URL = $env:TEST_DATABASE_URL
pnpm build
pnpm test:integration
```

Изолированная проверка миграции, которой не нужна сборка приложения:
`node --test tests/account-migration.test.mjs`. Её можно выполнить и на
прежней выделенной БД WIN1251, не меняя её настроек: эта фикстура использует
только ASCII и временную схему. Полный integration всё равно требует UTF8/UTC.
