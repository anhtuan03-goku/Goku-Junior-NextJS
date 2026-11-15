import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toSafeUserDTO } from "@/application/dtos/mappers";
import { ProfileSettingsPanel } from "@/components/profile/profile-settings";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

// Protected SSR: Requires verified JWT session cookie & fresh `sessionVersion`
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
    <section>
      <ProfileSettingsPanel initialUser={toSafeUserDTO(user)} />
    </section>
  );
}
