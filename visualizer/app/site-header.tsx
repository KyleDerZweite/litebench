"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="LiteBench home">
        litebench<span aria-hidden="true">.</span>
      </Link>
      <nav aria-label="Main navigation">
        {[
          ["/", "Results"],
          ["/score/", "Score"],
          ["/agentbench/", "AgentBench"],
        ].map(([href, label]) => (
          <Link
            aria-current={
              pathname.replace(/\/$/, "") === href.replace(/\/$/, "")
                ? "page"
                : undefined
            }
            href={href}
            key={href}
          >
            {label}
          </Link>
        ))}
      </nav>
      <a
        className="header-source"
        href="https://github.com/KyleDerZweite/litebench"
      >
        Source <span aria-hidden="true">↗</span>
      </a>
    </header>
  );
}
