# Goku-Junior-NextJS (`goku.frame`)

Đào Tạo Phòng Lập Trình - Junior - GOKU

Ứng dụng khám phá hình ảnh, lưu trữ bộ sưu tập cá nhân và viết nhật ký thị giác theo phong cách **Siêu tối giản (Ultra-Minimalist)** trên nền tảng **Next.js App Router + `shadcn/ui` + Neon PostgreSQL**, tuân thủ nghiêm ngặt **Clean Architecture** và bảo mật đa lớp.

---

## Tính năng Cốt lõi

- **Chính sách Zero-PII**: Đăng ký / đăng nhập chỉ gồm duy nhất `username` (unique) và `password` (hash bằng `bcryptjs` cost `12`). Không thu thập email, SĐT hay thông tin cá nhân.
- **Infinite Scroll & Đa nguồn ảnh mở rộng**: Cuộn vô tận mượt mà với `UnsplashImageProvider` (mặc định) và `PicsumRandomProvider` (nguồn ảnh mở rộng mẫu theo giao diện `IImageProvider`).
- **`UnsplashQuotaWorker` (`50 req/giờ`, `30 ảnh/req`, Zero-`429`)**:
  - Gộp request đồng thời bằng **Singleflight**, luôn lấy tối đa `per_page=30` ảnh/request và tự động bóc tách hồ sơ nhiếp ảnh gia vào bộ nhớ đệm Neon PostgreSQL.
  - Phân bổ ngân sách ưu tiên giữa xem chi tiết nhiếp ảnh gia, mở rộng kho ảnh Infinite Scroll và hàng đợi nền gửi sự kiện `links.download_location` (kèm bộ lọc chống SSRF).
  - Tự động chuyển sang **Zero-429 Fallback Pool** khi chạm ngưỡng giới hạn giờ, không làm đứt gãy trải nghiệm người dùng.
- **Chế độ Nhiếp ảnh gia & Hồ sơ Chi tiết (`/photographers/[username]`)**: Tùy chọn bật/tắt hiển thị thông tin tác giả ngay trên thanh điều khiển hoặc trang cài đặt; xem tiểu sử, số liệu và bộ sưu tập của từng nhiếp ảnh gia.
- **1 Ảnh đã lưu ↔ Nhiều Bài viết (`Private` / `Public`)**: Cho phép viết không giới hạn số bài viết trên cùng 1 ảnh đã lưu, chỉnh sửa nội dung hoặc chuyển đổi `Private` ↔ `Public` bất cứ lúc nào.
- **Thả tim Ẩn danh (Không Bình luận, Không Thông báo)**: Người dùng (kể cả tác giả bài viết) chỉ thấy tổng số lượt thích; danh tính người thích/bỏ thích chỉ được ghi log riêng cho **Admin**.
- **Quản lý Hồ sơ & Avatar 1-Slot Cloudinary**: Tự động cắt vuông & nén ảnh sang `WebP` ở trình duyệt, kiểm tra magic bytes ở server và xóa/ghi đè slot cũ để đảm bảo mỗi user chỉ dùng tối đa **1 slot ảnh** trên Cloudinary.
- **Bảng điều khiển Admin (`/admin`)**: Quản lý tài khoản (khóa/mở khóa, cấp quyền, xóa kèm dọn slot Cloudinary), thống kê lượt lưu ảnh & bài viết 7 ngày, theo dõi sức khỏe Quota Worker và xem nhật ký lượt thả tim.

---

## Hệ thống Đa Agent (Antigravity & Gemini)

- `GEMINI.md` & `AGENTS.md`: Hiến pháp kiến trúc và bảo mật nạp tự động cho Gemini & Antigravity.
- `.agents/agents/qc-engineer.md` (Skill: `.agents/skills/qc-test-suite/SKILL.md`): Chuyên viên kiểm thử tự động (Clean Architecture boundaries, Unit/Integration, E2E).
- `.agents/agents/red-team-auditor.md` (Skill: `.agents/skills/red-team-audit/SKILL.md`): Chuyên viên Red-Team rà soát bước cuối từ BE → FE → Bảo mật → Hiệu năng → Responsive (`375px` – `1440px`).

---

## Khởi chạy Dự án

```bash
# 1. Sao chép cấu hình môi trường
cp .env.example .env

# 2. Cài đặt thư viện
pnpm install

# 3. Đẩy schema lên Neon PostgreSQL & khởi tạo Admin mặc định (INITIAL_ADMIN_USERNAME / PASSWORD)
pnpm db:push
pnpm db:seed

# 4. Chạy môi trường phát triển
pnpm dev

# 5. Kiểm tra chất lượng (Typecheck + Clean Architecture + Unit Tests)
pnpm qc
```
