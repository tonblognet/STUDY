import { prisma } from "@/db";
import { PricingClient, type PublicProduct } from "@/components/pricing-client";
import { DEFAULT_PRODUCTS } from "@/lib/payments/plans";

export const metadata = { title: "Тарифы" };
export const dynamic = "force-dynamic";

async function loadProducts(): Promise<PublicProduct[]> {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { displayOrder: "asc" },
    });
    return products.map((product) => ({
      code: product.code,
      name: product.name,
      description: product.description ?? "",
      amountKopecks: product.price,
      durationMonths: product.durationDays
        ? Math.round(product.durationDays / 30)
        : 0,
      features: Array.isArray(product.features)
        ? product.features.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      purchasable: product.purchasable,
    }));
  } catch {
    if (process.env.NODE_ENV === "production")
      throw new Error("Product catalog is unavailable");
    return DEFAULT_PRODUCTS.map((product) => ({
      ...product,
      features: [...product.features],
      purchasable: true,
    }));
  }
}

export default async function PricingPage() {
  return (
    <div className="page-shell pricing-page">
      <div className="page-title">
        <h1>Тарифы без скрытых условий</h1>
        <p>
          Цены и возможности управляются централизованно. Название тарифа не
          используется как проверка доступа — за доступ отвечают entitlements.
        </p>
      </div>
      <PricingClient products={await loadProducts()} />
    </div>
  );
}
