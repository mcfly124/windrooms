import ManageLookup from "./ManageLookup";

export const metadata = { title: "Manage your booking — Flyspot Rooms" };

export default function ManagePage() {
  return (
    <div className="max-w-md mx-auto space-y-6 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Manage your booking</h1>
        <p className="text-mut mt-1 text-sm">
          Enter the confirmation code from your booking email (like <span className="font-mono">FR-00012</span>)
          together with the email you booked with.
        </p>
      </div>
      <ManageLookup />
    </div>
  );
}
