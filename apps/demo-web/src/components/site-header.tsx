"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/demo-provider";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Northstar Workspace home">
      <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M16 2.8 19.1 13l10.1 3-10.1 3L16 29.2 12.9 19 2.8 16l10.1-3L16 2.8Z" /><circle cx="16" cy="16" r="2.1" /></svg></span>
      <span className="brand-copy"><strong>Northstar</strong><span>Workspace</span></span>
    </Link>
  );
}

export function SiteHeader() {
  const { authenticatedUser, authenticationLoading, signOut } = useDemo();
  const pathname = usePathname();
  const router = useRouter();
  const previousPath = useRef(pathname);
  const [logoutError, setLogoutError] = useState(false);
  const links = [
    { href: "/dashboard", label: "Overview" },
    { href: "/profile", label: "Profile" },
    { href: "/settings", label: "Settings" },
  ];

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    document.querySelector<HTMLElement>("#main-content h1")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        {authenticatedUser ? <nav className="header-nav" aria-label="Main navigation">
          {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}
        </nav> : null}
        <div className="header-tools">
          {authenticationLoading ? <span className="header-sample-tag" role="status">Checking session…</span> : authenticatedUser ? (
            <div className="header-auth-state">
              <span className="header-sample-tag"><span aria-hidden="true" />{authenticatedUser.displayName}</span>
              <button className="button button-secondary header-signout" type="button" onClick={() => {
                setLogoutError(false);
                void signOut().then(() => router.push("/login")).catch(() => setLogoutError(true));
              }}>Sign out</button>
            </div>
          ) : <div className="header-auth-links"><Link href="/login">Sign in</Link><Link className="button button-secondary" href="/signup">Create account</Link></div>}
        </div>
      </div>
      {logoutError ? <p className="global-sample-note" role="alert">Sign-out could not be confirmed. Please try again.</p> : authenticatedUser ? <div className="global-sample-note" role="note">
        Signed in through the Sentriq Security API. Protected actions require a server-side policy decision.
      </div> : null}
    </header>
  );
}
