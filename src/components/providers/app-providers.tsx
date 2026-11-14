"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster, toast } from "sonner";
import type { SafeUserDTO } from "@/domain/entities/models";

interface AppSessionContextValue {
  user: SafeUserDTO | null;
  setUser: (user: SafeUserDTO | null) => void;
  showPhotographerInfo: boolean;
  togglePhotographerMode: (nextValue?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

const LOCAL_PHOTOGRAPHER_MODE_KEY = "goku_photographer_mode";
const LOCAL_PHOTOGRAPHER_EVENT = "goku:photographer-mode";

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

export function AppProviders({
  initialUser,
  children,
}: {
  initialUser: SafeUserDTO | null;
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
          target
            ? "Đã bật hiển thị thông tin nhiếp ảnh gia."
            : "Đã ẩn thông tin nhiếp ảnh gia (Chế độ tối giản thuần khiết).",
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
          target
            ? "Đã bật hiển thị thông tin nhiếp ảnh gia."
            : "Đã ẩn thông tin nhiếp ảnh gia.",
        );
      } catch {
        setUserState(prevUser);
        toast.error("Không thể lưu cài đặt hiển thị nhiếp ảnh gia.");
      }
    },
    [showPhotographerInfo, user],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUserState(null);
      toast.success("Đã đăng xuất.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Không thể đăng xuất, vui lòng thử lại.");
    }
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      showPhotographerInfo,
      togglePhotographerMode,
      logout,
    }),
    [user, setUser, showPhotographerInfo, togglePhotographerMode, logout],
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
