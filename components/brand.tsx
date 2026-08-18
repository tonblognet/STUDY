import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="Поступай — главная">
    <span className="brand-mark" aria-hidden="true"><i /></span>
    {!compact && <span className="brand-word">Поступай</span>}
  </Link>;
}
