let accountIdentity: string | null = null;
export function setAccountIdentity(id: string | null) {
  accountIdentity = id;
}

export async function accountRequest(
  url: string,
  method = "GET",
  body?: unknown,
) {
  // Parent provider installs the page's identity in the same effect flush.
  await Promise.resolve();
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(accountIdentity ? { "x-account-id": accountIdentity } : {}),
    },
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 401 && !url.startsWith("/api/auth/")
        ? "Сессия истекла. Войдите снова"
        : (data.error ?? "Сервис временно недоступен. Попробуйте ещё раз"),
    );
  return data;
}
