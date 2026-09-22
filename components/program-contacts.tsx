import type { Program } from "@/lib/data";
import { DataSourceLink } from "./data-status";

export function ProgramContacts({
  contact,
}: {
  contact: NonNullable<Program["admissionsContact"]>;
}) {
  return (
    <div className="mgu-faculty-contact">
      <h4>Приёмная комиссия факультета</h4>
      <address>{contact.address.value ?? "Адрес уточняется"}</address>
      {contact.address.status === "outdated" && <p>{contact.address.note}</p>}
      <p>{contact.phone.value ?? "Телефон уточняется"}</p>
      <p>{contact.email.value ?? "Электронная почта уточняется"}</p>
      {contact.website.value && (
        <a href={contact.website.value} target="_blank" rel="noreferrer">
          Сайт приёмной комиссии ↗
        </a>
      )}
      <DataSourceLink field={contact.address} />
      <small>
        Это адрес комиссии; место проведения занятий уточните у факультета.
      </small>
    </div>
  );
}
