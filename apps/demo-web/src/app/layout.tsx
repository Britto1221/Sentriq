import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@sentriq/access/components.css";
import "@sentriq/access/tokens.css";
import "./globals.css";
import { NorthstarProviders } from "@/components/northstar-providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "Northstar Workspace",
    template: "%s · Northstar Workspace",
  },
  description: "Northstar Workspace demonstrates passkey authentication, fresh verification for sensitive actions, and single-use account recovery with Sentriq.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-access-theme="northstar">
      <body>
        <NorthstarProviders>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          <SiteHeader />
          {children}
          <footer className="site-footer">
            <div className="page-container footer-inner">
              <span>Northstar Workspace</span>
              <span>Self-hosted demo · Sentriq SDK · Synthetic account data</span>
            </div>
          </footer>
        </NorthstarProviders>
      </body>
    </html>
  );
}
