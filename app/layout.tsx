import type { Metadata } from "next";
import { Literata, Manrope } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { UserStateProvider } from "@/components/user-state-provider";
import { getSessionUser } from "@/lib/auth/session";
import { getSiteBaseUrl } from "@/lib/site-url";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["cyrillic", "latin"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["cyrillic", "latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = await getSiteBaseUrl();
  const title = "Поступай — проверенные данные о поступлении";
  const description =
    "Предметы ЕГЭ, проходные баллы, места и стоимость с годом, статусом и ссылкой на официальный источник.";
  const image = new URL("og.png", metadataBase).toString();
  return {
    metadataBase,
    title: { default: title, template: "%s · Поступай" },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ru_RU",
      images: [
        {
          url: image,
          width: 1733,
          height: 909,
          alt: "Поступай — проверенные данные о поступлении",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${manrope.variable} ${literata.variable}`}>
        <UserStateProvider signedIn={Boolean(user)}>
          <Header
            signedIn={Boolean(user)}
            displayName={user?.name ?? user?.email}
          />
          <main>{children}</main>
          <Footer />
        </UserStateProvider>
      </body>
    </html>
  );
}
