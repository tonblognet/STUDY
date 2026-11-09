import { describe, expect, it } from "vitest";
import { PayloadTooLarge, readBoundedJson } from "./body";
describe("bounded JSON", () => {
  it("parses valid JSON and rejects invalid input", async () => {
    expect(
      await readBoundedJson(
        new Request("http://local", { method: "POST", body: '{"n":1}' }),
      ),
    ).toEqual({ n: 1 });
    expect(
      await readBoundedJson(
        new Request("http://local", { method: "POST", body: "{" }),
      ),
    ).toBe(null);
  });
  it("counts actual UTF-8 bytes even without a length header", async () => {
    await expect(
      readBoundedJson(
        new Request("http://local", { method: "POST", body: '"яяяя"' }),
        8,
      ),
    ).rejects.toBeInstanceOf(PayloadTooLarge);
  });
});
