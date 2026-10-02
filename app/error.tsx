"use client";
import { PageState } from "@/components/page-state";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <PageState
      title="Не удалось загрузить страницу"
      description="Повторите попытку. Если ошибка сохраняется, вернитесь к каталогу или откройте страницу позже."
    >
      <button onClick={reset} className="button button-primary">
        Попробовать снова
      </button>
    </PageState>
  );
}
