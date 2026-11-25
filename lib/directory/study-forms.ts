/**
 * Study forms written in one listing cell. Universities separate them with
 * commas, semicolons, slashes, «и» or plain spaces («Очная Заочная»).
 */
const FORM = /очно-заочная|заочная|очная/g;

export function normalizeProgramText(value: string | null): string {
  return (value ?? "")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** The distinct forms of a cell listing two or more of them, otherwise null. */
export function aggregateStudyForms(value: string | null): string[] | null {
  const text = normalizeProgramText(value);
  const forms = text.match(FORM) ?? [];
  if (new Set(forms).size < 2) return null;
  // Anything except separators means the cell says more than a list of forms.
  const rest = text
    .replace(FORM, " ")
    .replace(/(?:^|\s)и(?=\s|$)/g, " ")
    .replace(/[\s,;/]+/g, "");
  if (rest) return null;
  return [...new Set(forms)];
}
