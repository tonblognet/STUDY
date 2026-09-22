"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Program } from "@/lib/data";
import type { DataStatus, SourceKind } from "@/lib/admissions/types";

const fields = {
  tuition: "Стоимость в год",
  budgetPlaces: "Бюджетные места",
  paidPlaces: "Платные места",
};
type Field = keyof typeof fields;
export function CatalogProgramEditor({
  program,
  revisionId,
}: {
  program: Program;
  revisionId: string;
}) {
  const router = useRouter();
  const [field, setField] = useState<Field>("tuition");
  const keys = {
    tuition: "tuitionValue",
    budgetPlaces: "budgetPlacesValue",
    paidPlaces: "paidPlacesValue",
  } as const;
  const [fact, setFact] = useState(program.tuitionValue);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function selectField(next: Field) {
    setField(next);
    setFact(program[keys[next]]);
  }
  return (
    <form
      className="catalog-review-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const response = await fetch(`/api/admin/programs/${program.slug}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              baseRevisionId: revisionId,
              field,
              fact: { ...fact, sourceKind: fact.sourceKind ?? "html" },
              reason,
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            setError(result.error ?? "Не удалось создать черновик");
            return;
          }
          router.push(`/admin/catalog/${result.revision.id}`);
        } catch {
          setError(
            "Не удалось связаться с сервером. Проверьте очередь перед повторной отправкой.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Изменение попадёт в очередь проверки. До подтверждения на сайте
        останется прежнее значение.
      </p>
      <label htmlFor="edit-field">Поле</label>
      <select
        id="edit-field"
        value={field}
        onChange={(event) => selectField(event.target.value as Field)}
      >
        {Object.entries(fields).map(([key, title]) => (
          <option value={key} key={key}>
            {title}
          </option>
        ))}
      </select>
      <label htmlFor="edit-value">
        Значение · пустое поле означает «неизвестно»
      </label>
      <input
        id="edit-value"
        type="number"
        min="0"
        step={field === "tuition" ? "0.01" : "1"}
        value={fact.value ?? ""}
        onChange={(event) =>
          setFact({
            ...fact,
            value:
              event.target.value === "" ? null : Number(event.target.value),
          })
        }
      />
      <label htmlFor="edit-status">Статус факта</label>
      <select
        id="edit-status"
        value={fact.status}
        onChange={(event) =>
          setFact({ ...fact, status: event.target.value as DataStatus })
        }
      >
        <option value="verified">Подтверждено источником</option>
        <option value="pending_review">Требует проверки</option>
        <option value="not_published">Не опубликовано</option>
        <option value="conflicting_sources">Источники расходятся</option>
        <option value="outdated">Устарело</option>
        <option value="not_applicable">Не применимо</option>
      </select>
      <label htmlFor="edit-year">Год приёмной кампании</label>
      <input
        id="edit-year"
        type="number"
        required
        value={fact.year}
        onChange={(event) =>
          setFact({ ...fact, year: Number(event.target.value) })
        }
      />
      <label htmlFor="edit-source">Официальный источник</label>
      <input
        id="edit-source"
        type="url"
        required
        value={fact.sourceUrl}
        onChange={(event) =>
          setFact({ ...fact, sourceUrl: event.target.value })
        }
      />
      <label htmlFor="edit-kind">Тип источника</label>
      <select
        id="edit-kind"
        value={fact.sourceKind ?? "html"}
        onChange={(event) =>
          setFact({ ...fact, sourceKind: event.target.value as SourceKind })
        }
      >
        {["html", "pdf", "xlsx", "csv", "docx"].map((kind) => (
          <option key={kind}>{kind}</option>
        ))}
      </select>
      <label htmlFor="edit-source-name">Название источника</label>
      <input
        id="edit-source-name"
        required
        value={fact.sourceName}
        onChange={(event) =>
          setFact({ ...fact, sourceName: event.target.value })
        }
      />
      <label htmlFor="edit-section">Раздел или строка документа</label>
      <input
        id="edit-section"
        required
        value={fact.sourceSection ?? ""}
        onChange={(event) =>
          setFact({ ...fact, sourceSection: event.target.value })
        }
      />
      <label htmlFor="edit-retrieved">Дата получения источника (ISO)</label>
      <input
        id="edit-retrieved"
        required
        value={fact.retrievedAt}
        onChange={(event) =>
          setFact({ ...fact, retrievedAt: event.target.value })
        }
      />
      <label htmlFor="edit-checked">Дата проверки (ISO)</label>
      <input
        id="edit-checked"
        required
        value={fact.checkedAt}
        onChange={(event) =>
          setFact({ ...fact, checkedAt: event.target.value })
        }
      />
      <label htmlFor="edit-note">Оговорки и ограничения факта</label>
      <textarea
        id="edit-note"
        value={fact.note ?? ""}
        onChange={(event) => setFact({ ...fact, note: event.target.value })}
      />
      <label htmlFor="edit-reason">Причина изменения</label>
      <textarea
        id="edit-reason"
        required
        minLength={10}
        maxLength={2000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button className="button button-primary" disabled={busy}>
        {busy ? "Сохраняем…" : "Отправить на проверку"}
      </button>
      <p role="alert">{error}</p>
    </form>
  );
}
