import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Sentriq SDK — Independent integration",
  description: "A separate host application integrating Sentriq's public passkey SDK.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
