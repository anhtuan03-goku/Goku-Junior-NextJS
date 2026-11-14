import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminConsoleDashboard } from "@/components/admin/admin-dashboard";
import { getContainer } from "@/infrastructure/container";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Console",
  description: "Platform administration, quota telemetry, and moderation logs.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  const user = await getOptionalSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const container = getContainer();
  const [stats, users, likeLogs] = await Promise.all([
    container.useCases.adminGetStats.execute(user),
    container.useCases.adminListUsers.execute(user),
    container.useCases.adminListLikeLogs.execute(user, 100),
  ]);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Admin Console
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Manage accounts, monitor frame saves & story activity, inspect Quota
          Worker health, and review the admin-only heart audit log.
        </p>
      </div>

      <AdminConsoleDashboard
        initialStats={stats}
        initialUsers={users}
        initialLikeLogs={likeLogs}
        currentAdminId={user.id}
      />
    </section>
  );
}
