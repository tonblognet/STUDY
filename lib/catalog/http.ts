import { NextResponse } from "next/server";
import { CatalogError } from "./types";

export async function catalogRequestBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new CatalogError("Пустой запрос");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32_000) {
      await reader.cancel();
      throw new CatalogError("Запрос слишком большой", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CatalogError("Некорректный JSON");
  }
}

export function catalogFailure(error: unknown) {
  if (error instanceof CatalogError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error("catalog_operation_failed", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return NextResponse.json(
    { error: "Хранилище каталога недоступно. Повторите позже." },
    { status: 503 },
  );
}
