"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AccessProvider } from "@sentriq/access";
import { DemoProvider } from "@/components/demo-provider";

export function NorthstarProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <AccessProvider navigationKey={pathname}><DemoProvider>{children}</DemoProvider></AccessProvider>;
}
