"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-page">
      <span>Ошибка</span>
      <h1>Что-то пошло не так</h1>
      <p>
        Мы уже можем повторить запрос. Если ошибка останется, вернитесь позже.
      </p>
      <button onClick={reset} className="button button-primary">
        Попробовать снова
      </button>
    </div>
  );
}
