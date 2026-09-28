import { Suspense } from "react";
import type { Metadata } from "next";
import { Prompt, Roboto, Lora } from "next/font/google";
import { cn } from "@/lib/utils";
import { requireSession } from "@/lib/auth-session";
import Navbar from "@/components/navbar";
import "../globals.css";

const loraHeading = Lora({ subsets: ["latin"], variable: "--font-heading" });

const roboto = Roboto({ subsets: ["latin"], variable: "--font-sans" });

export const promptFont = Prompt({
  weight: ["400", "500", "700"],
  subsets: ["thai"],
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "CLS Facility Center",
    template: "%s | CLS Facility Center",
  },
  description:
    "ระบบบริหารจัดการศูนย์โทรคมนาคมและสถานีเคเบิลใต้น้ำ ปากบารา (PKB) · สงขลา (SKA)",
};

export const instant = false;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireSession();

  return (
    <html
      lang="th"
      className={cn(promptFont.className, "font-sans", roboto.variable, loraHeading.variable)}
    >
      <body className="flex min-h-screen flex-col">
        <Suspense fallback={<div className="h-16 border-b bg-background" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1">{children}</main>
        <footer className="border-t bg-muted/40 py-4">
          <div className="mx-auto max-w-(--breakpoint-xl) px-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
            CLS Facility Center — ระบบบริหารจัดการสถานีเคเบิลใต้น้ำปากบารา (สตูล) และสงขลา
          </div>
        </footer>
      </body>
    </html>
  );
}
