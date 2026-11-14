import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Sign In",
  description: "Restricted administrator authentication gateway.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLoginPage() {
  const user = await getOptionalSessionUser();
  if (user?.role === "ADMIN") {
    redirect("/admin");
  }

  return <AdminLoginForm currentMemberUsername={user?.username ?? null} />;
}
