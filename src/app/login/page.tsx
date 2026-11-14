import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MinimalAuthForm } from "@/components/auth/auth-form";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your naut.frame account to access your saved photography collection and private or public visual stories.",
  alternates: {
    canonical: "/login",
  },
};

export default async function LoginPage() {
  const user = await getOptionalSessionUser();
  if (user) {
    redirect("/");
  }
  return <MinimalAuthForm mode="login" />;
}
