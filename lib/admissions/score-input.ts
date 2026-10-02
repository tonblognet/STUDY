/** Changing subjects must never supply scores the applicant has not entered. */
export function selectScoreSubjects(
  scores: Record<string, number>,
  subjects: string[],
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(scores).filter(([subject]) => subjects.includes(subject)),
  );
}

/** Keep missing and invalid input distinct from a valid zero score. */
export function updateScoreInput(
  scores: Record<string, number>,
  subject: string,
  input: string,
): Record<string, number> {
  const next = { ...scores };
  if (input.trim() === "") delete next[subject];
  else next[subject] = Number(input);
  return next;
}
