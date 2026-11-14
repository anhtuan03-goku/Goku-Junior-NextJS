import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toSafeUserDTO } from "@/application/dtos/mappers";
import { ProfileSettingsPanel } from "@/components/profile/profile-settings";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile Settings",
  description:
    "Manage your unique username, password, photographer attribution display, and single-slot avatar.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SettingsPage() {
  const user = await getOptionalSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <div className="mx-auto max-w-2xl space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Profile Settings
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Manage your unique username, password, photographer attribution
          preferences, and avatar.
        </p>
      </div>

      <ProfileSettingsPanel initialUser={toSafeUserDTO(user)} />
    </section>
  );
}
