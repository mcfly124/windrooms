"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Fires one beacon per public page view. Client-side on purpose: it keeps
 * prefetches and most crawlers out of the numbers, and it is the only place
 * document.referrer is available.
 */
export default function Track() {
  const pathname = usePathname();
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === pathname) return; // guard StrictMode's double effect
    sent.current = pathname;
    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
      search: window.location.search || null,
    });
    // keepalive so the view still lands if they navigate away immediately
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
