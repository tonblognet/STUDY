import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { HeaderClient } from "@/components/header-client";
import { fullSitePath, IS_GITHUB_PAGES } from "@/lib/runtime-mode";

export async function Header() {
  const user = IS_GITHUB_PAGES ? null : await getChatGPTUser();
  return <HeaderClient
    signedIn={Boolean(user)}
    displayName={user?.displayName}
    signInPath={IS_GITHUB_PAGES ? fullSitePath("/account") : chatGPTSignInPath("/account")}
    signOutPath={IS_GITHUB_PAGES ? fullSitePath("/") : chatGPTSignOutPath("/")}
  />;
}
