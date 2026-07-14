"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllInboxRead, markInboxRead } from "@/app/actions/inbox";

type Item = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  unread: boolean;
  createdAt: string;
  calendarHref: string | null;
};

const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  "booking.new": { label: "new booking", cls: "bg-ok-soft text-ok" },
  "booking.changed": { label: "changed", cls: "bg-warn-soft text-warn" },
  "booking.cancelled": { label: "cancelled", cls: "bg-bad-soft text-bad" },
  "payment.paid": { label: "payment", cls: "bg-acc-soft text-acc" },
};

export default function InboxClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unreadCount = items.filter((i) => i.unread).length;

  function read(id: number) {
    startTransition(async () => {
      await markInboxRead(id);
      router.refresh();
    });
  }

  function readAll() {
    startTransition(async () => {
      await markAllInboxRead();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Inbox</h1>
        {unreadCount > 0 && (
          <span className="rounded-full bg-acc text-white text-xs px-2 py-0.5 font-mono">{unreadCount}</span>
        )}
        {unreadCount > 0 && (
          <button onClick={readAll} disabled={pending} className="ml-auto btn-ghost text-xs">
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const style = TYPE_STYLE[item.type] ?? { label: item.type, cls: "bg-hovr text-mut" };
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 flex items-start gap-3 ${
                item.unread ? "bg-card border-acc/40" : "bg-card border-line opacity-75"
              }`}
            >
              {item.unread && <span className="mt-1.5 w-2 h-2 rounded-full bg-acc shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider ${style.cls}`}>
                    {style.label}
                  </span>
                  <span className={`text-sm ${item.unread ? "font-semibold" : "font-medium"}`}>{item.title}</span>
                  <span className="label-mono ml-auto">{item.createdAt}</span>
                </div>
                {item.body && <p className="text-sm text-mut mt-1">{item.body}</p>}
                <div className="flex gap-3 mt-2">
                  {item.calendarHref && (
                    <Link href={item.calendarHref} className="text-xs text-acc hover:underline">
                      open in calendar
                    </Link>
                  )}
                  {item.unread && (
                    <button onClick={() => read(item.id)} disabled={pending} className="text-xs text-faint hover:text-ink">
                      mark read
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-center text-faint font-mono py-10 text-sm">
            Nothing yet — new public bookings, changes and paid links land here.
          </p>
        )}
      </div>
    </div>
  );
}
