import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MinimalAuthForm } from "@/components/auth/auth-form";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const metadata: Metadata = {
  title: "Create Account",
  description:
    "Create a minimalist naut.frame account using only a unique username and password.",
  alternates: {
    canonical: "/register",
  },
};

export default async function RegisterPage() {
  const user = await getOptionalSessionUser();
  if (user) {
    redirect("/");
  }
  return <MinimalAuthForm mode="register" />;
}
