import Link from "next/link";
import type { RoomType } from "@prisma/client";

export default function RoomCard({
  roomId,
  name,
  type,
  checkIn,
  checkOut,
  nightly,
  total,
}: {
  roomId: number;
  name: string;
  type: RoomType;
  checkIn: string;
  checkOut: string;
  nightly: string;
  total: string;
}) {
  const isDouble = type === "DOUBLE";
  return (
    <div className="rounded-2xl border border-line bg-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">Room {name}</div>
          <div className="text-sm text-mut">{isDouble ? "Double — two single beds" : "Single room"}</div>
        </div>
        <span className="label-mono rounded-full border border-line px-2.5 py-1">
          {isDouble ? "2 guests" : "1 guest"}
        </span>
      </div>
      <ul className="text-sm text-mut space-y-1">
        <li>· Private room, shared facilities at the tunnel</li>
        <li>· Self check-in with a personal door code</li>
        <li>· Wi-Fi, linen and towels included</li>
      </ul>
      <div className="mt-auto flex items-end justify-between pt-2">
        <div>
          <div className="font-mono text-lg font-semibold">{nightly}</div>
          <div className="text-xs text-faint">per night · {total} total</div>
        </div>
        <Link href={`/book/${roomId}?in=${checkIn}&out=${checkOut}`} className="btn-primary">
          Book
        </Link>
      </div>
    </div>
  );
}
