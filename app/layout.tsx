import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["cyrillic", "latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://postupai.example"),
  title: { default: "Поступай — выбери вуз и программу в Москве", template: "%s · Поступай" },
  description: "Проходные баллы, бюджетные места, стоимость и требования поступления в московские вузы.",
  openGraph: { title: "Поступай", description: "Все о поступлении в московские вузы — в одном месте.", type: "website", locale: "ru_RU" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" suppressHydrationWarning><body className={manrope.variable}><Header /><main>{children}</main><Footer /></body></html>;
}
