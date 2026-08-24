# Одинаковая настройка Codex для команды

Цель — синхронизировать рабочее поведение Codex, не копируя личный аккаунт или секреты. Основной контекст уже находится в Git: `AGENTS.md`, `.agents/skills`, архитектурные документы, execution plan и handoff.

## Настройка второго компьютера

1. Установить Codex и войти в собственный OpenAI-аккаунт.
2. Клонировать репозиторий и открыть именно его корень в Codex.
3. Установить Node.js и pnpm версий из `package.json` и CI, затем выполнить `pnpm install --frozen-lockfile`.
4. В Codex открыть Plugins и установить набор из `docs/PLUGIN_MANIFEST.md`; после установки начать новую задачу.
5. При необходимости перенести безопасные значения из `.codex/config.example.toml` в личный `~/.codex/config.toml`, сохранив собственные account-specific настройки.
6. Перезапустить Codex, чтобы он обнаружил проектные навыки из `.agents/skills`.
7. Использовать одинаковый доступный model/reasoning profile для сложных слоёв; доступность конкретных моделей может различаться между аккаунтами.
8. Проверить настройку запросом: `Прочитай AGENTS.md, docs/EXECUTION_PLAN.md и docs/HANDOFF.md. Назови активный слой, обязательные проверки и проектные навыки.`

## Что синхронизируется через GitHub

- `AGENTS.md` — обязательные правила для любого Codex в проекте;
- `.agents/skills/` — три проектных процесса;
- `.codex/config.example.toml` и `.codex/agents/` — безопасные примеры ролей;
- `docs/EXECUTION_PLAN.md` — порядок и границы слоёв;
- `docs/HANDOFF.md` — текущее состояние передачи;
- GitHub Issue/PR templates и CI — одинаковый Definition of Done.

## Что нельзя копировать

Никогда не переносить через Git, архив или мессенджер:

- `~/.codex/auth.json` и `.sandbox-secrets`;
- `.env`, API keys, OAuth tokens, cookies и MCP credentials;
- `sessions`, `memories`, локальные базы SQLite, логи и attachments;
- plugin cache целиком;
- личный `config.toml`, пока из него не удалены все секреты и персональные пути.

Каждый разработчик авторизует плагины и MCP самостоятельно. Если плагин недоступен в его аккаунте/workspace, проектные правила и CI всё равно обеспечат одинаковый инженерный процесс.

## Ежедневный старт

```powershell
git switch main
git pull --ff-only origin main
git status --short
pnpm install --frozen-lockfile
```

После этого читать текущий handoff и работать только в ветке активного слоя. Не использовать один и тот же локальный checkout одновременно двумя людьми.
