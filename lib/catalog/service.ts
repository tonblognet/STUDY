import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { catalogChecksum, catalogDiff } from "./diff";
import { parseCatalog } from "./schema";
import { externalizeOfferings, type OfferingSet } from "./offering-sets";
import { offeringTrack } from "@/lib/education-pathways";
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

type PublishedCatalog = {
  revisionId: string;
  publishedAt: string;
  snapshot: CatalogSnapshot;
};
let publishedCache: PublishedCatalog | null = null;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Revisions are immutable (database triggers), so a verified and parsed
 * publication is reused until the head moves; only the head is read per call.
 * The shared snapshot is frozen: a caller can never alter another request.
 */
export async function readPublishedCatalog(
  db: PrismaClient,
): Promise<PublishedCatalog> {
  const head = await db.catalogHead.findUnique({
    where: { id: "public" },
    select: {
      revision: { select: { id: true, status: true, reviewedAt: true } },
    },
  });
  if (!head?.revision || head.revision.status !== "PUBLISHED")
    throw new CatalogError("Каталог ещё не опубликован", 503);
  if (publishedCache?.revisionId === head.revision.id) return publishedCache;
  const revision = await db.catalogRevision.findUniqueOrThrow({
    where: { id: head.revision.id },
    select: { checksum: true, payload: true },
  });
  if (catalogChecksum(revision.payload) !== revision.checksum)
    throw new CatalogError("Нарушена целостность публикации каталога", 503);
  publishedCache = deepFreeze({
    revisionId: head.revision.id,
    publishedAt: head.revision.reviewedAt!.toISOString(),
    snapshot: parseCatalog(revision.payload),
  });
  return publishedCache;
}

/** Write each new listing set atomically; existing digests are reused as is. */
export async function storeOfferingSets(
  db: PrismaClient,
  snapshot: CatalogSnapshot,
  sets: OfferingSet[],
) {
  const fresh = new Set(sets.map((set) => set.digest));
  const referenced = snapshot.directoryDetails
    .map((row) => row.offeringSet?.digest)
    .filter((digest): digest is string => Boolean(digest));
  if (!referenced.length) return;
  const existing = new Set(
    (
      await db.catalogOfferingSet.findMany({
        where: { digest: { in: referenced } },
        select: { digest: true },
      })
    ).map((row) => row.digest),
  );
  const missing = referenced.filter(
    (digest) => !fresh.has(digest) && !existing.has(digest),
  );
  if (missing.length)
    throw new CatalogError(
      `Нет сохранённого перечня ${missing[0]}: импортируйте каталог с перечнями`,
      409,
    );
  for (const set of sets) {
    if (existing.has(set.digest)) continue;
    try {
      await db.$transaction([
        db.catalogOfferingSet.create({
          data: {
            digest: set.digest,
            universitySlug: set.universitySlug,
            count: set.offerings.length,
          },
        }),
        db.catalogOffering.createMany({
          data: set.offerings.map((offering, position) => ({
            setDigest: set.digest,
            position,
            offeringId: offering.id,
            track: offeringTrack(offering.level),
            data: json(offering),
          })),
        }),
      ]);
    } catch (error) {
      // A concurrent import may have stored the identical content first.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
    }
  }
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
  // Listings leave the payload as content-addressed sets (ADR 0006). Sets are
  // written before the revision, outside its transaction; an unused set is
  // harmless, while a revision never references a missing one.
  const { snapshot, sets } = externalizeOfferings(parseCatalog(input));
  const reason = reasonText(options.reason);
  const checksum = catalogChecksum(snapshot);
  const base = await db.catalogHead.findUniqueOrThrow({
    where: { id: "public" },
    select: {
      revisionId: true,
      revision: { select: { checksum: true, payload: true } },
    },
  });
  if (base.revisionId !== options.expectedRevisionId)
    throw new CatalogError(
      "Каталог уже изменился. Загрузите опубликованную версию и повторите импорт",
      409,
    );
  await storeOfferingSets(db, snapshot, sets);
  // Published evidence is immutable. Prepare the potentially large diff and JSON
  // before taking the shared lock, then verify its base again inside the transaction.
  const changes =
    base.revision?.checksum === checksum
      ? null
      : catalogDiff(
          base.revision ? parseCatalog(base.revision.payload) : null,
          snapshot,
        );
  const prepared = changes
    ? {
        payload: json(snapshot),
        changes: json(changes),
        changeCount: changes.length,
      }
    : null;
  const fingerprint = catalogChecksum({ checksum, base: base.revisionId });
  return db.$transaction(
    async (tx) => {
      // A transaction-scoped database lock works across CLI imports and web replicas.
      await tx.$queryRaw`SELECT "id" FROM "CatalogHead" WHERE "id" = 'public' FOR UPDATE`;
      const head = await tx.catalogHead.findUniqueOrThrow({
        where: { id: "public" },
        select: {
          revisionId: true,
          revision: { select: { id: true, checksum: true } },
        },
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
      const existing = await tx.catalogRevision.findUnique({
        where: { fingerprint },
        select: { id: true, status: true },
      });
      if (existing)
        return { id: existing.id, status: existing.status, unchanged: true };
      if (!prepared)
        throw new CatalogError("Нарушена целостность публикации каталога", 503);
      const revision = await tx.catalogRevision.create({
        data: {
          fingerprint,
          checksum,
          baseRevisionId: head.revisionId,
          payload: prepared.payload,
          changes: prepared.changes,
          reason,
          createdBy: options.actor.id,
        },
        select: { id: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: options.actor.id,
          action: "CATALOG_REVIEW_CREATED",
          entityType: "CatalogRevision",
          entityId: revision.id,
          after: { checksum, changes: prepared.changeCount },
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
        select: { revisionId: true },
      });
      const revision = await tx.catalogRevision.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          baseRevisionId: true,
          checksum: true,
          payload: true,
        },
      });
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
        select: { id: true },
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
