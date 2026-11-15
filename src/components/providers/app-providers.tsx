"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster, toast } from "sonner";
import type { SafeUserDTO } from "@/domain/entities/models";
import {
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  type Locale,
  UI_STRINGS,
  autoTranslateMessage,
  detectBrowserLocaleClient,
  normalizeLocale,
} from "@/lib/i18n";

interface AppSessionContextValue {
  user: SafeUserDTO | null;
  setUser: (user: SafeUserDTO | null) => void;
  showPhotographerInfo: boolean;
  togglePhotographerMode: (nextValue?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (typeof UI_STRINGS)[Locale];
  tr: (message: string) => string;
}

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

const LOCAL_PHOTOGRAPHER_MODE_KEY = "naut_photographer_mode";
const LOCAL_PHOTOGRAPHER_EVENT = "naut:photographer-mode";
const LOCAL_LOCALE_EVENT = "naut:locale";

function subscribeLocaleStore(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCAL_LOCALE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCAL_LOCALE_EVENT, onStoreChange);
  };
}

function getClientLocaleSnapshot(): Locale {
  try {
    const fromStorage = normalizeLocale(
      window.localStorage.getItem(LOCALE_STORAGE_KEY),
    );
    if (fromStorage) return fromStorage;
  } catch {
    // Ignore storage error
  }

  const cookieMatch = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE_NAME}=`));
  const fromCookie = normalizeLocale(cookieMatch?.split("=")[1]);
  if (fromCookie) return fromCookie;

  return detectBrowserLocaleClient();
}

function subscribeGuestPhotographerMode(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCAL_PHOTOGRAPHER_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCAL_PHOTOGRAPHER_EVENT, onStoreChange);
  };
}

function getGuestPhotographerSnapshot(): boolean {
  try {
    const saved = window.localStorage.getItem(LOCAL_PHOTOGRAPHER_MODE_KEY);
    return saved !== "false";
  } catch {
    return true;
  }
}

function getServerPhotographerSnapshot(): boolean {
  return true;
}

function persistLocaleClient(nextLocale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  } catch {
    // Ignore restricted storage mode
  }
  document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = nextLocale;
}

export function AppProviders({
  initialUser,
  initialLocale = "vi",
  children,
}: {
  initialUser: SafeUserDTO | null;
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUserState] = useState<SafeUserDTO | null>(initialUser);
  const [prevInitialUser, setPrevInitialUser] = useState<SafeUserDTO | null>(
    initialUser,
  );

  if (prevInitialUser !== initialUser) {
    setPrevInitialUser(initialUser);
    setUserState(initialUser);
  }

  const locale = useSyncExternalStore(
    subscribeLocaleStore,
    getClientLocaleSnapshot,
    () => initialLocale,
  );

  // Sync external DOM lang attribute & cookie whenever locale resolves/changes
  useEffect(() => {
    persistLocaleClient(locale);
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      persistLocaleClient(nextLocale);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(LOCAL_LOCALE_EVENT));
      }
      router.refresh();
    },
    [router],
  );

  const toggleLocale = useCallback(() => {
    setLocale(locale === "vi" ? "en" : "vi");
  }, [locale, setLocale]);

  const guestPhotographerMode = useSyncExternalStore(
    subscribeGuestPhotographerMode,
    getGuestPhotographerSnapshot,
    getServerPhotographerSnapshot,
  );

  const showPhotographerInfo = user
    ? user.showPhotographerInfo
    : guestPhotographerMode;

  const setUser = useCallback((nextUser: SafeUserDTO | null) => {
    setUserState(nextUser);
  }, []);

  const tr = useCallback(
    (message: string) => autoTranslateMessage(message, locale),
    [locale],
  );

  const togglePhotographerMode = useCallback(
    async (explicitValue?: boolean) => {
      const target =
        explicitValue !== undefined ? explicitValue : !showPhotographerInfo;

      try {
        window.localStorage.setItem(
          LOCAL_PHOTOGRAPHER_MODE_KEY,
          String(target),
        );
        window.dispatchEvent(new Event(LOCAL_PHOTOGRAPHER_EVENT));
      } catch {
        // Ignore storage errors in restricted modes
      }

      if (!user) {
        toast.success(
          tr(
            target
              ? "Photographer attribution enabled."
              : "Photographer attribution hidden (pure minimalist view).",
          ),
        );
        return;
      }

      const prevUser = user;
      setUserState({ ...user, showPhotographerInfo: target });

      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showPhotographerInfo: target }),
        });
        if (!res.ok) {
          throw new Error("Failed");
        }
        const data = (await res.json()) as { user: SafeUserDTO };
        setUserState(data.user);
        toast.success(
          tr(
            target
              ? "Photographer attribution enabled."
              : "Photographer attribution hidden.",
          ),
        );
      } catch {
        setUserState(prevUser);
        toast.error(
          locale === "vi"
            ? "Không thể lưu tuỳ chọn hiển thị tác giả."
            : "Could not save photographer display preference.",
        );
      }
    },
    [locale, showPhotographerInfo, tr, user],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUserState(null);
      toast.success(tr("Signed out."));
      router.push("/");
      router.refresh();
    } catch {
      toast.error(
        locale === "vi"
          ? "Không thể đăng xuất. Vui lòng thử lại."
          : "Unable to sign out. Please try again.",
      );
    }
  }, [locale, router, tr]);

  const t = UI_STRINGS[locale];

  const value = useMemo(
    () => ({
      user,
      setUser,
      showPhotographerInfo,
      togglePhotographerMode,
      logout,
      locale,
      setLocale,
      toggleLocale,
      t,
      tr,
    }),
    [
      user,
      setUser,
      showPhotographerInfo,
      togglePhotographerMode,
      logout,
      locale,
      setLocale,
      toggleLocale,
      t,
      tr,
    ],
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <AppSessionContext.Provider value={value}>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </AppSessionContext.Provider>
    </NextThemesProvider>
  );
}

export function useAppSession() {
  const ctx = useContext(AppSessionContext);
  if (!ctx) {
    throw new Error("useAppSession must be used inside AppProviders");
  }
  return ctx;
}
