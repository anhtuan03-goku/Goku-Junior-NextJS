"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SafeUserDTO } from "@/domain/entities/models";

export function MinimalAuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { setUser } = useAppSession();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = (await res.json()) as {
        user?: SafeUserDTO;
        error?: string;
      };

      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Không thể xác thực tài khoản.");
      }

      setUser(data.user);
      toast.success(
        isRegister
          ? `Chào mừng @${data.user.username}! Tài khoản của bạn đã sẵn sàng.`
          : `Chào mừng trở lại, @${data.user.username}!`,
      );
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[72vh] max-w-sm flex-col justify-center py-8">
      <div className="space-y-6 rounded-xl border border-border bg-card p-6 sm:p-7">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight">
            {isRegister ? "Tạo tài khoản tối giản" : "Đăng nhập"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isRegister
              ? "Chỉ cần một tên đăng nhập duy nhất và mật khẩu."
              : "Truy cập kho hình ảnh đã lưu và nhật ký cá nhân của bạn."}
          </p>
        </div>

        {/* Zero-PII Policy Pledge */}
        <div className="rounded-lg border border-border/80 bg-secondary/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span>Cam kết Quyền riêng tư (Zero-PII)</span>
          </div>
          Chúng tôi <strong>không thu thập email, số điện thoại hay bất kỳ thông tin cá nhân nào</strong> cho bất cứ mục đích gì. Mật khẩu của bạn được băm một chiều (hash) an toàn trước khi lưu vào cơ sở dữ liệu.
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="block text-xs font-medium text-foreground"
            >
              Tên đăng nhập
            </label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="vd: goku_minimal"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-foreground"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 8 : 1}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? "Tối thiểu 8 ký tự" : "••••••••"}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-0.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {isRegister ? "Đăng ký ngay" : "Đăng nhập"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {isRegister ? (
            <>
              Đã có tài khoản?{" "}
              <Link
                href="/login"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Đăng nhập
              </Link>
            </>
          ) : (
            <>
              Chưa có tài khoản?{" "}
              <Link
                href="/register"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Đăng ký mới
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
