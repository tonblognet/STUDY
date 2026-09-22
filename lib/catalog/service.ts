import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { catalogChecksum, catalogDiff } from "./diff";
import { parseCatalog } from "./schema";
import { CatalogError, type CatalogSnapshot } from "./types";

export type CatalogActor = { id: string; role: Role };
export function assertCatalogEditor(actor: CatalogActor) {
  if (!["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"].includes(actor.role))
    throw new CatalogError("Недостаточно прав для изменения каталога", 403);
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const reasonText = (value: string) => {
  const reason = value.trim();
  if (reason.length < 10 || reason.length > 2000)
    throw new CatalogError("Укажите причину: от 10 до 2000 символов");
  return reason;
};

/** IDs used by saved lists and slugs used by links remain reserved after removal. */
async function assertProgramIdentities(
  tx: Prisma.TransactionClient,
  snapshot: CatalogSnapshot,
) {
  const incoming = JSON.stringify(
    snapshot.programs.map(({ id, slug }) => ({ id, slug })),
  );
  const conflicts = await tx.$queryRaw<Array<{ slug: string }>>`
    SELECT candidate.slug
    FROM jsonb_to_recordset(${incoming}::jsonb) AS candidate(id text, slug text)
    WHERE EXISTS (
      SELECT 1
      FROM "CatalogRevision" revision
      CROSS JOIN LATERAL jsonb_array_elements(revision.payload->'programs') previous
      WHERE revision.status = 'PUBLISHED'
        AND ((previous->>'id' = candidate.id AND previous->>'slug' <> candidate.slug)
          OR (previous->>'slug' = candidate.slug AND previous->>'id' <> candidate.id))
    )
    LIMIT 1
  `;
  if (conflicts.length)
    throw new CatalogError(
      `Нельзя менять опубликованную идентичность программы ${conflicts[0].slug}: сохраните прежние id и slug`,
      409,
    );
}

export async function readPublishedCatalog(db: PrismaClient) {
  const head = await db.catalogHead.findUnique({
    where: { id: "public" },
    include: { revision: true },
  });
  if (!head?.revision || head.revision.status !== "PUBLISHED")
    throw new CatalogError("Каталог ещё не опубликован", 503);
  if (catalogChecksum(head.revision.payload) !== head.revision.checksum)
    throw new CatalogError("Нарушена целостность публикации каталога", 503);
  return {
    revisionId: head.revision.id,
    publishedAt: head.revision.reviewedAt!.toISOString(),
    snapshot: parseCatalog(head.revision.payload),
  };
}

export async function stageCatalog(
  db: PrismaClient,
  input: unknown,
  options: {
    actor: CatalogActor;
    reason: string;
    expectedRevisionId: string | null;
  },
) {
  assertCatalogEditor(options.actor);
  const snapshot = parseCatalog(input);
  const reason = reasonText(options.reason);
  const checksum = catalogChecksum(snapshot);
  return db.$transaction(
    async (tx) => {
      // A transaction-scoped database lock works across CLI imports and web replicas.
      await tx.$queryRaw`SELECT "id" FROM "CatalogHead" WHERE "id" = 'public' FOR UPDATE`;
      const head = await tx.catalogHead.findUniqueOrThrow({
        where: { id: "public" },
        include: { revision: true },
      });
      if (head.revisionId !== options.expectedRevisionId)
        throw new CatalogError(
          "Каталог уже изменился. Загрузите опубликованную версию и повторите импорт",
          409,
        );
      if (head.revision?.checksum === checksum)
        return {
          id: head.revision.id,
          status: "PUBLISHED" as const,
          unchanged: true,
        };
      await assertProgramIdentities(tx, snapshot);
      const fingerprint = catalogChecksum({ checksum, base: head.revisionId });
      const existing = await tx.catalogRevision.findUnique({
        where: { fingerprint },
      });
      if (existing)
        return { id: existing.id, status: existing.status, unchanged: true };
      const changes = catalogDiff(
        head.revision ? parseCatalog(head.revision.payload) : null,
        snapshot,
      );
      const revision = await tx.catalogRevision.create({
        data: {
          fingerprint,
          checksum,
          baseRevisionId: head.revisionId,
          payload: json(snapshot),
          changes: json(changes),
          reason,
          createdBy: options.actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: options.actor.id,
          action: "CATALOG_REVIEW_CREATED",
          entityType: "CatalogRevision",
          entityId: revision.id,
          after: { checksum, changes: changes.length },
        },
      });
      return { id: revision.id, status: revision.status, unchanged: false };
    },
    { timeout: 30_000 },
  );
}

export async function reviewCatalog(
  db: PrismaClient,
  id: string,
  decision: "publish" | "reject",
  options: {
    actor: CatalogActor;
    reason: string;
  },
) {
  assertCatalogEditor(options.actor);
  const reason = reasonText(options.reason);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CatalogHead" WHERE "id" = 'public' FOR UPDATE`;
      const head = await tx.catalogHead.findUniqueOrThrow({
        where: { id: "public" },
      });
      const revision = await tx.catalogRevision.findUnique({ where: { id } });
      if (!revision) throw new CatalogError("Изменение не найдено", 404);
      if (decision === "publish" && head.revisionId === id)
        return { id, status: "PUBLISHED" as const, unchanged: true };
      if (decision === "reject" && revision.status === "REJECTED")
        return { id, status: "REJECTED" as const, unchanged: true };
      if (revision.status !== "REVIEW")
        throw new CatalogError("Изменение уже рассмотрено", 409);
      if (decision === "publish" && revision.baseRevisionId !== head.revisionId)
        throw new CatalogError(
          "Этот черновик основан на старой версии. Повторите импорт относительно текущей публикации",
          409,
        );
      if (decision === "publish") {
        const snapshot = parseCatalog(revision.payload);
        if (catalogChecksum(snapshot) !== revision.checksum)
          throw new CatalogError("Контрольная сумма не совпадает", 409);
        // Also protect drafts created before this validation was introduced.
        await assertProgramIdentities(tx, snapshot);
        await syncCatalogEntities(tx, snapshot);
      }
      const status = decision === "publish" ? "PUBLISHED" : "REJECTED";
      await tx.catalogRevision.update({
        where: { id },
        data: {
          status,
          reviewedBy: options.actor.id,
          reviewNote: reason,
          reviewedAt: new Date(),
        },
      });
      if (decision === "publish")
        await tx.catalogHead.update({
          where: { id: "public" },
          data: { revisionId: id },
        });
      await tx.auditLog.create({
        data: {
          actorId: options.actor.id,
          action:
            decision === "publish" ? "CATALOG_PUBLISHED" : "CATALOG_REJECTED",
          entityType: "CatalogRevision",
          entityId: id,
          before: { revisionId: head.revisionId },
          after: { revisionId: id, reason },
        },
      });
      return { id, status, unchanged: false };
    },
    { timeout: 60_000 },
  );
}

/** Keep FK targets in sync; never delete saved programs or their history. */
async function syncCatalogEntities(
  tx: Prisma.TransactionClient,
  snapshot: CatalogSnapshot,
) {
  const ids = new Map<string, string>();
  for (const university of snapshot.universities) {
    const facts = snapshot.universityFacts.find(
      (item) => item.universitySlug === university.slug,
    )!.facts;
    const data = {
      name: university.name,
      shortName: university.shortName,
      description: university.description,
      city: university.city,
      websiteUrl: university.website,
      logoUrl: facts.logoUrl.status === "verified" ? facts.logoUrl.value : null,
      address: facts.address.status === "verified" ? facts.address.value : null,
      hasMilitaryCenter:
        facts.militaryCenter.status === "verified"
          ? facts.militaryCenter.value
          : null,
      dormitoryCount:
        facts.dormitoryCount.status === "verified"
          ? facts.dormitoryCount.value
          : null,
      status: "PUBLISHED" as const,
    };
    const row = await tx.university.upsert({
      where: { slug: university.slug },
      create: { slug: university.slug, ...data },
      update: data,
    });
    ids.set(university.slug, row.id);
  }
  const { programDurationMonths } = await import(
    "@/data-sources/core/duration"
  );
  for (const program of snapshot.programs) {
    const data = {
      name: program.title,
      code: program.code,
      universityId: ids.get(program.universitySlug)!,
      level:
        program.level === "Бакалавриат"
          ? ("BACHELOR" as const)
          : ("SPECIALIST" as const),
      form:
        program.form === "Очная"
          ? ("FULL_TIME" as const)
          : program.form === "Очно-заочная"
            ? ("PART_TIME" as const)
            : ("EXTRAMURAL" as const),
      durationMonths: programDurationMonths(program),
      status: "PUBLISHED" as const,
    };
    await tx.educationProgram.upsert({
      where: { slug: program.slug },
      create: { slug: program.slug, ...data, publishedAt: new Date() },
      update: data,
    });
  }
  await tx.educationProgram.updateMany({
    where: {
      slug: { notIn: snapshot.programs.map((row) => row.slug) },
      status: "PUBLISHED",
    },
    data: { status: "DRAFT" },
  });
  await tx.university.updateMany({
    where: {
      slug: { notIn: snapshot.universities.map((row) => row.slug) },
      status: "PUBLISHED",
    },
    data: { status: "DRAFT" },
  });
}
