import "server-only";
import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE_NAME,
  type Locale,
  detectLocaleFromAcceptLanguage,
  normalizeLocale,
} from "@/lib/i18n";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const savedCookie = normalizeLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
  );
  if (savedCookie) {
    return savedCookie;
  }

  const headerStore = await headers();
  return detectLocaleFromAcceptLanguage(headerStore.get("accept-language"));
}
