import { getSession } from "@/lib/auth";
import AccountClient from "./AccountClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = (await getSession())!;
  return (
    <AccountClient
      name={session.user.name}
      email={session.user.email}
      role={session.user.role}
      locations={session.user.locations.length > 0 ? session.user.locations.length : null}
    />
  );
}
