import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { HeaderClient } from "@/components/header-client";

export async function Header() {
  const user = await getChatGPTUser();
  return <HeaderClient
    signedIn={Boolean(user)}
    displayName={user?.displayName}
    signInPath={chatGPTSignInPath("/account")}
    signOutPath={chatGPTSignOutPath("/")}
  />;
}
