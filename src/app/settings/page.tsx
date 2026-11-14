import { redirect } from "next/navigation";
import { toSafeUserDTO } from "@/application/dtos/mappers";
import { ProfileSettingsPanel } from "@/components/profile/profile-settings";
import { getOptionalSessionUser } from "@/interfaces/http/api-helpers";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getOptionalSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <div className="mx-auto max-w-2xl space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Cài đặt hồ sơ cá nhân
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Quản lý tên định danh, mật khẩu, chế độ hiển thị nhiếp ảnh gia và ảnh đại diện.
        </p>
      </div>

      <ProfileSettingsPanel initialUser={toSafeUserDTO(user)} />
    </section>
  );
}
