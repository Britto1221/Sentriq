"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AccessProvider } from "@sentriq/access";

/** Keeps Next route awareness at the app boundary so the shared package stays router-agnostic. */
export function ConsoleAccessProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <AccessProvider navigationKey={pathname}>{children}</AccessProvider>;
}
