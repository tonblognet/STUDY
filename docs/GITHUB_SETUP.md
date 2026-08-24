# GitHub setup для двух разработчиков

## Однократная настройка

В настройках репозитория создать ruleset для `main`:

- запретить прямой push и force push;
- требовать pull request перед merge;
- требовать минимум одно approval;
- сбрасывать approval после новых изменений;
- требовать resolved conversations;
- требовать ветку, актуальную относительно `main`;
- требовать успешный check `quality`;
- применять правила к администраторам;
- разрешить squash merge и автоматически удалять слитые ветки.

Создать GitHub Project с колонками `Backlog`, `Active layer`, `Review`, `Done`. Одновременно в `Active layer` может находиться только одна задача слоя.

## Старт нового слоя

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/layer-NN-short-name
```

Создать Issue через шаблон `Project layer`, назначить исполнителя и ревьюера, затем связать PR с Issue.

## Передача ревьюеру

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm security:audit
git diff --check
git status --short
git push -u origin codex/layer-NN-short-name
```

Ревьюер делает отдельный checkout ветки, повторяет проверки, просматривает staged/product diff и оставляет замечания в PR. После squash merge следующий слой создаётся только от обновлённого `main`.
