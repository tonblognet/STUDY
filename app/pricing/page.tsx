import { prisma } from "@/db";
import { PricingClient, type PublicProduct } from "@/components/pricing-client";
import { DEFAULT_PRODUCTS } from "@/lib/payments/plans";
import { getSessionUser } from "@/lib/auth/session";
import { getCheckoutSettings } from "@/lib/payments/config";

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
      durationDays: product.durationDays,
      features: Array.isArray(product.features)
        ? product.features.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      purchasable:
        product.purchasable &&
        ["default_1", "default_3", "default_12"].includes(product.code),
    }));
  } catch {
    if (process.env.NODE_ENV === "production")
      throw new Error("Product catalog is unavailable");
    return DEFAULT_PRODUCTS.map((product) => ({
      ...product,
      features: [...product.features],
      durationDays: product.durationMonths ? product.durationMonths * 30 : null,
      purchasable: true,
    }));
  }
}

export default async function PricingPage() {
  const user = await getSessionUser();
  let settings: ReturnType<typeof getCheckoutSettings> | null = null;
  try {
    settings = getCheckoutSettings();
  } catch {
    /* Checkout stays unavailable until configured. */
  }
  return (
    <div className="page-shell pricing-page">
      <div className="page-title">
        <h1>Тарифы без скрытых условий</h1>
        <p>
          Выберите срок доступа. Оплата откроется на защищённой странице банка.
          Полноценные AI-функции появятся на следующем этапе.
        </p>
      </div>
      <PricingClient
        accountId={user?.id ?? null}
        checkoutEnabled={!!settings}
        environment={settings?.environment ?? "live"}
        products={(await loadProducts()).map((product) => ({
          ...product,
          purchasable:
            product.purchasable &&
            (!settings || settings.enabledProducts.has(product.code)),
        }))}
      />
    </div>
  );
}
