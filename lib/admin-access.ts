export function parseAdminEmails(value: string | undefined): Set<string> {
  return new Set((value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}

export function isAdminEmail(email: string, configured = process.env.POSTUPAI_ADMIN_EMAILS): boolean {
  return parseAdminEmails(configured).has(email.trim().toLowerCase());
}
