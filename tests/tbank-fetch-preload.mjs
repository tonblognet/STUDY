// Loaded only by the isolated integration child. Production has no fixture flag.
const db = new URL(process.env.DATABASE_URL ?? "");
const fixture = new URL(process.env.TEST_TBANK_FIXTURE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(db.hostname) ||
  !db.pathname.endsWith("_test") ||
  !/^operations_test_[a-f0-9]{32}$/.test(db.searchParams.get("schema") ?? "") ||
  fixture.hostname !== "127.0.0.1" ||
  fixture.protocol !== "http:"
)
  throw new Error("Dedicated local operations fixture required");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const address = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    ["securepay.tinkoff.ru", "rest-api-test.tinkoff.ru"].includes(
      address.hostname,
    )
  ) {
    if (
      address.protocol !== "https:" ||
      !/^\/v2\/(Init|GetState|CheckOrder|Cancel)$/.test(address.pathname)
    )
      throw new Error("Unexpected bank fixture request");
    const request = input instanceof Request ? input : null;
    // Never fall through to the real bank when the loopback fixture fails.
    return original(new URL(address.pathname, fixture), {
      ...(request
        ? {
            method: request.method,
            headers: request.headers,
            body: await request.clone().text(),
          }
        : {}),
      ...init,
    });
  }
  return original(input, init);
};
