import { redirect } from "next/navigation";
import { MinimalAuthForm } from "@/components/auth/auth-form";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export default async function RegisterPage() {
  const user = await getOptionalSessionUser();
  if (user) {
    redirect("/");
  }
  return <MinimalAuthForm mode="register" />;
}
