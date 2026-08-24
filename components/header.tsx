import { HeaderClient } from "@/components/header-client";

export function Header({
  signedIn,
  displayName,
}: {
  signedIn: boolean;
  displayName?: string | null;
}) {
  return <HeaderClient signedIn={signedIn} displayName={displayName} />;
}
