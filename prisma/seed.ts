import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { DEFAULT_PRODUCTS } from "../lib/payments/plans";

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production");

  const entitlementKeys = [
    ...new Set(DEFAULT_PRODUCTS.flatMap((product) => [...product.features])),
  ];
  for (const key of entitlementKeys) {
    await db.entitlement.upsert({
      where: { key },
      update: {},
      create: { key, name: key },
    });
  }
  for (const [displayOrder, product] of DEFAULT_PRODUCTS.entries()) {
    const record = await db.product.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        description: product.description,
        price: product.amountKopecks,
        durationDays: product.durationMonths
          ? product.durationMonths * 30
          : null,
        displayOrder,
        features: [...product.features],
      },
      create: {
        code: product.code,
        name: product.name,
        description: product.description,
        price: product.amountKopecks,
        durationDays: product.durationMonths
          ? product.durationMonths * 30
          : null,
        displayOrder,
        features: [...product.features],
      },
    });
    for (const key of product.features) {
      const entitlement = await db.entitlement.findUniqueOrThrow({
        where: { key },
      });
      await db.productEntitlement.upsert({
        where: {
          productId_entitlementId: {
            productId: record.id,
            entitlementId: entitlement.id,
          },
        },
        update: {},
        create: { productId: record.id, entitlementId: entitlement.id },
      });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12)
      throw new Error(
        "SEED_ADMIN_PASSWORD must contain at least 12 characters",
      );
    await db.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {},
      create: {
        email: adminEmail.toLowerCase(),
        name: "Локальный администратор",
        passwordHash: await hash(adminPassword, 12),
        emailVerified: new Date(),
        role: "ADMIN",
      },
    });
  }
}

main().finally(() => db.$disconnect());
