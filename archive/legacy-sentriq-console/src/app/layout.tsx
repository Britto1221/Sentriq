import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoProvider } from "@/lib/demo-context";
import { ConsoleAccessProvider } from "@/components/access-provider";
import "@sentriq/access/tokens.css";
import "@sentriq/access/components.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sentriq — Trust doesn't end at login", template: "%s · Sentriq" },
  description: "A development preview of evidence-led protection for sensitive actions.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <ConsoleAccessProvider><DemoProvider>{children}</DemoProvider></ConsoleAccessProvider>
      </body>
    </html>
  );
}
