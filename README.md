# Chương: DEV-FE-010 · NextJS — Đồ Án Tổng Hợp (`naut.frame`)

Báo cáo thực hành và hoàn thành **Chương DEV-FE-010 · NextJS** trên dự án **naut.frame** — ứng dụng sưu tầm nhiếp ảnh tối giản & nhật ký thị giác xây dựng bằng **Next.js App Router**, **Tailwind CSS v4**, **Neon PostgreSQL (Drizzle ORM)** và hỗ trợ **song ngữ tự động Tiếng Việt / Tiếng Anh (`VI` / `EN`)**.

---

## 📌 Tổng Quan Yêu Cầu Của Chương

1. **Cấu trúc App Router chuẩn (`app/`, `components/`, `lib/`)**
2. **Chọn SSR / SSG / ISR hợp lý cho từng trang (ghi rõ lý do)**
3. **Server / Client Component đúng chỗ**
4. **Metadata SEO đầy đủ (`title`, `description`, `OpenGraph`)**
5. **Tối ưu ảnh / font; Lighthouse cao; build & deploy**

---

## 📌 Chi Tiết Giải Pháp Đã Triển Khai

### 🔷 1. Cấu Trúc App Router Chuẩn Kết Hợp Clean Architecture

Dự án tổ chức thư mục chuẩn theo quy ước **Next.js App Router** đặt trong `src/`, đồng thời phân tách rõ ràng các tầng nghiệp vụ để dễ bảo trì và mở rộng:

```text
src/
├── app/                          # Tầng định tuyến Next.js App Router (Pages, Layouts, Metadata, API Routes)
│   ├── layout.tsx                # Root Layout: cấu hình Font, SEO gốc, JSON-LD & Session/Locale SSR
│   ├── page.tsx                  # Trang chủ Explore (/)
│   ├── space/page.tsx            # Trang kho ảnh vũ trụ NASA (/space)
│   ├── community/page.tsx        # Trang nhật ký cộng đồng công khai (/community)
│   ├── photographers/[username]/ # Trang chi tiết nhiếp ảnh gia động (/photographers/[username])
│   ├── privacy/page.tsx          # Trang chính sách quyền riêng tư Zero-PII (/privacy)
│   ├── login/ & register/        # Trang Đăng nhập & Đăng ký nhiều bước
│   ├── saved/ & settings/        # Trang cá nhân cần đăng nhập (/saved, /settings)
│   ├── robots.ts & sitemap.ts    # Cấu hình SEO tự động cho công cụ tìm kiếm
│   ├── opengraph-image.tsx       # Sinh ảnh OpenGraph 1200x630 động
│   └── api/                      # Route Handlers (auth, images, space, posts, saved, profile, admin)
├── components/                   # Tầng giao diện người dùng (UI & Client Islands)
│   ├── auth/                     # Form đăng nhập & Form đăng ký nhiều bước + linh vật gấu Bắc Cực
│   ├── images/ & space/          # Lưới ảnh Masonry, Infinite Scroll & Lightbox xem chi tiết
│   ├── saved/ & profile/         # Xưởng viết bài (Story Studio) & Cài đặt tài khoản
│   ├── layout/                   # Header điều hướng tối giản (chuyển đổi VI/EN, Sáng/Tối) & Footer
│   └── ui/                       # Các primitive UI tái sử dụng (Button, Input, Dialog, Switch...)
├── lib/                          # Tiện ích dùng chung phía ứng dụng
│   ├── i18n.ts & i18n-server.ts  # Module song ngữ VI/EN & tự động nhận diện ngôn ngữ
│   ├── validations/forms.ts      # Bộ schema Zod kiểm tra dữ liệu cho toàn bộ hệ thống Form
│   ├── compress-avatar.ts        # Nén & cắt ảnh đại diện sang WebP ngay trên trình duyệt
│   └── site-config.ts            # Hằng số cấu hình thương hiệu & URL chuẩn SEO
└── domain/ · application/ · infrastructure/ · interfaces/
                                  # Các tầng Clean Architecture (Entities, Use Cases, DB & Quota Worker)
```

---

### 🔷 2. Chiến Lược Chọn SSR / SSG / ISR Cho Từng Trang

Mỗi route được chọn cơ chế render phù hợp với đặc thù dữ liệu và yêu cầu bảo mật:

| Đường dẫn (Route) | Tệp triển khai | Chiến lược | Lý do lựa chọn |
| :--- | :--- | :--- | :--- |
| **`/robots.txt`**, **`/opengraph-image`** | [robots.ts](src/app/robots.ts), [opengraph-image.tsx](src/app/opengraph-image.tsx) | **SSG (Static)** | Nội dung quy tắc lập chỉ mục và ảnh đại diện chia sẻ mạng xã hội cố định, build sẵn 1 lần giúp phản hồi tức thì (~0ms). |
| **`/sitemap.xml`** | [sitemap.ts](src/app/sitemap.ts) | **ISR (`revalidate = 3600`)** | Tự động làm mới sơ đồ trang mỗi 1 giờ cho Googlebot mà không tốn tài nguyên tính toán ở mọi request. |
| **`/photographers/[username]`** | [page.tsx](src/app/photographers/[username]/page.tsx) | **Hybrid ISR (`revalidate: 600`) + SSR** | Thông tin hồ sơ nhiếp ảnh gia công khai và `generateMetadata` được lưu đệm 10 phút qua `unstable_cache` để tải cực nhanh và tiết kiệm hạn ngạch Unsplash; riêng khách đã đăng nhập vẫn được gắn trạng thái `savedByMe` theo phiên. |
| **`/privacy`** | [page.tsx](src/app/privacy/page.tsx) | **Static Content + SSR Shell** | Nội dung chính sách bảo mật cố định (không truy vấn DB), kết hợp Header đồng bộ phiên đăng nhập và ngôn ngữ `VI/EN`. |
| **`/` (Explore)**, **`/space`** | [page.tsx](src/app/page.tsx), [space/page.tsx](src/app/space/page.tsx) | **SSR (`force-dynamic`) + Cache Pool** | Cần cá nhân hoá trạng thái ảnh đã lưu (`savedByMe`) theo từng user ngay lần tải đầu tiên; dữ liệu ảnh phía dưới lấy từ Pool đệm Postgres / bộ nhớ TTL 15 phút nên vẫn phản hồi rất nhanh và không bao giờ lỗi `429`. |
| **`/community`** | [community/page.tsx](src/app/community/page.tsx) | **SSR (`force-dynamic`)** | Hiển thị bài viết công khai mới nhất kèm tổng lượt tim (`likesCount`) và trạng thái thả tim của người xem theo thời gian thực. |
| **`/saved`**, **`/settings`**, **`/admin`** | [saved/page.tsx](src/app/saved/page.tsx), [settings/page.tsx](src/app/settings/page.tsx), [admin/page.tsx](src/app/admin/page.tsx) | **Protected SSR (`force-dynamic`)** | Dữ liệu riêng tư của từng tài khoản; bắt buộc kiểm tra JWT `HttpOnly` cookie trên máy chủ, tự động `redirect("/login")` nếu chưa xác thực và gắn `robots: noindex`. |

---

### 🔷 3. Phân Định Server Component & Client Component Đúng Chỗ

- **Server Components (mặc định tại `src/app/**/page.tsx` & `layout.tsx`)**:
  - Đọc cookie phiên đăng nhập (`getOptionalSessionUser`) và ngôn ngữ (`getRequestLocale`) trực tiếp trên server.
  - Gọi Use Cases lấy dữ liệu khởi tạo ban đầu, kiểm tra phân quyền (`redirect`), sinh thẻ SEO và dữ liệu có cấu trúc `JSON-LD` (`WebSite`, `ProfilePage`).
  - Toàn bộ tầng `src/infrastructure/` đều gắn `import "server-only"` để đảm bảo khóa bí mật API và driver cơ sở dữ liệu **không bao giờ** lọt xuống bundle trình duyệt.
- **Client Components (`"use client"` chỉ đặt ở các nhánh tương tác trong `src/components/**`)**:
  - [MinimalHeader](src/components/layout/minimal-header.tsx): Chuyển đổi Sáng/Tối (`next-themes`), chuyển đổi ngôn ngữ tức thời `VI / EN`, bật/tắt tên nhiếp ảnh gia.
  - [InfiniteExploreFeed](src/components/images/infinite-explore-feed.tsx) & [NasaSpaceFeed](src/components/space/nasa-space-feed.tsx): Cuộn vô cực bằng `IntersectionObserver`, tìm kiếm tức thời với `AbortController`.
  - [MinimalAuthForm](src/components/auth/auth-form.tsx), [SavedMultiPostStudio](src/components/saved/saved-studio.tsx), [ProfileSettingsPanel](src/components/profile/profile-settings.tsx): Xử lý form tương tác, modal lightbox và nén ảnh WebP phía client.

---

### 🔷 4. Metadata SEO Đầy Đủ (`title`, `description`, `OpenGraph`, `JSON-LD`)

- **Metadata gốc & Template tiêu đề** tại [layout.tsx](src/app/layout.tsx): Tự động chuẩn hoá tiêu đề dạng `%s · naut.frame`, khai báo `metadataBase`, `canonical`, `keywords`, thẻ `openGraph` (`vi_VN` & `en_US`) và `twitter` (`summary_large_image`).
- **Metadata động (`generateMetadata`)** tại [photographers/[username]/page.tsx](src/app/photographers/[username]/page.tsx): Tự động sinh `title`, `description` (rút trích từ tiểu sử nhiếp ảnh gia) và ảnh đại diện OpenGraph riêng cho từng tác giả.
- **Ảnh OpenGraph động** tại [opengraph-image.tsx](src/app/opengraph-image.tsx): Dựng ảnh preview `1200×630` sắc nét bằng `next/og`.
- **Kiểm soát lập chỉ mục chặt chẽ**:
  - Công khai trên [sitemap.ts](src/app/sitemap.ts) & [robots.ts](src/app/robots.ts): `/`, `/space`, `/community`, `/privacy`, `/photographers/*`.
  - Chặn lập chỉ mục (`noindex, nofollow` + `disallow`) đối với các trang cá nhân/quản trị: `/saved`, `/settings`, `/admin`, `/api/`.

---

### 🔷 5. Tối Ưu Ảnh, Font, Song Ngữ & Đóng Gói Build

- **Tối ưu Font chữ không giật bố cục**: Sử dụng `next/font/google` tại [layout.tsx](src/app/layout.tsx) với bộ font `Inter` (`subsets: ["latin", "vietnamese"]`, `display: "swap"`) và `Geist_Mono`, tự động self-host font ngay lúc build giúp hiển thị tiếng Việt có dấu sắc nét và không phát sinh request tới máy chủ font bên ngoài.
- **Tối ưu Hình ảnh & Chống nhảy khung hình (`CLS = 0`)**:
  - Khai báo sẵn tỷ lệ khung hình thực tế (`aspectRatio: width / height`) kèm màu nền chủ đạo (`backgroundColor: item.color`) cho mọi thẻ ảnh trước khi tải xong.
  - Gắn `loading="lazy"` + `decoding="async"` cho lưới ảnh Masonry và cấu hình whitelist `images.remotePatterns` an toàn trong [next.config.ts](next.config.ts).
  - Nén & cắt vuông ảnh đại diện sang chuẩn **WebP (`≤ 512×512`)** ngay trên trình duyệt tại [compress-avatar.ts](src/lib/compress-avatar.ts), giảm 70%–90% dung lượng trước khi upload lên Cloudinary.
- **Module Song ngữ `VI / EN` tự động ([i18n.ts](src/lib/i18n.ts))**: Tự động nhận diện ngôn ngữ từ `Accept-Language` / múi giờ trình duyệt ở lần truy cập đầu tiên, dịch tự động thông báo hệ thống sang tiếng Việt và cho phép chuyển đổi `VI ↔ EN` chỉ với 1 cú nhấp trên thanh Header.

---
---

# Chương: DEV-FE-011 · Form Handling & Validation — Hệ Thống Form Lớn

Báo cáo thực hành và hoàn thành **Chương DEV-FE-011 · Form Handling & Validation** trong dự án **naut.frame**.

---

## 📌 Tổng Quan Yêu Cầu Của Chương

1. **Form lớn dùng React Hook Form, gõ mượt (không lag)**
2. **Validation bằng Zod (`zodResolver`), bắt đúng edge cases**
3. **Thông báo lỗi inline rõ ràng, tiếng Việt**
4. **Form nhiều bước giữ dữ liệu, có thanh tiến trình**
5. **UX: khoá nút khi submit, không gửi khi còn lỗi**

---

## 📌 Chi Tiết Giải Pháp Đã Triển Khai

### 🔷 1. Hệ Thống Form Dùng React Hook Form — Gõ Mượt, Không Giật Lag

Toàn bộ các biểu mẫu trọng tâm trong ứng dụng đều được vận hành bởi **React Hook Form (`useForm`, `useWatch`)**:
- **Form Đăng ký nhiều bước & Đăng nhập**: [auth-form.tsx](src/components/auth/auth-form.tsx)
- **Form Cài đặt hồ sơ (Đổi username, Đổi mật khẩu 3 ô, Tuỳ chọn vai trò)**: [profile-settings.tsx](src/components/profile/profile-settings.tsx)
- **Form Xưởng viết câu chuyện (Story Studio)**: [saved-studio.tsx](src/components/saved/saved-studio.tsx)
- **Form Cổng đăng nhập Quản trị viên**: [admin-login-form.tsx](src/components/auth/admin-login-form.tsx)

**Lý do gõ mượt không lag**:
- Các ô nhập liệu được kết nối bằng cơ chế **uncontrolled input** (`{...register("username")}`, `{...register("password")}`) với cấu hình `mode: "onTouched"` và `reValidateMode: "onChange"`.
- Khi người dùng gõ phím nhanh liên tục, React không phải re-render lại toàn bộ cây giao diện ở mỗi ký tự; chỉ những phần tử cần theo dõi riêng lẻ (như bộ đếm ký tự `useWatch` hoặc ánh mắt linh vật `PolarBearMascot`) mới cập nhật nhẹ nhàng ở tốc độ 60fps.

---

### 🔷 2. Validation Bằng Zod (`zodResolver`) — Bắt Đầy Đủ Edge Cases

Tất cả quy tắc kiểm tra dữ liệu được tập trung tại [src/lib/validations/forms.ts](src/lib/validations/forms.ts) và tích hợp vào React Hook Form qua `zodResolver`:

- **Các trường hợp biên (Edge Cases) đã xử lý**:
  1. **Chuỗi toàn khoảng trắng hoặc chứa dấu cách ngầm**: Kiểm tra `.trim()` kết hợp cấm khoảng trắng bên trong `username` và `password`.
  2. **Ký tự đặc biệt ở biên hoặc lặp liên tiếp**: Chặn tên đăng nhập bắt đầu/kết thúc bằng `. _ -` (như `_naut` hoặc `naut.`) và chặn 2 ký tự đặc biệt đi liền nhau (`naut..frame`).
  3. **Độ mạnh mật khẩu & trùng lặp tài khoản**: Mật khẩu bắt buộc `8–128` ký tự, có ít nhất 1 chữ cái + 1 chữ số, và **không được trùng với tên đăng nhập**.
  4. **Đối chiếu chéo giữa các trường (`superRefine`)**: Kiểm tra `confirmPassword === password` khi đăng ký; kiểm tra `newPassword !== currentPassword` (không cho đặt mật khẩu mới giống hệt mật khẩu cũ) khi đổi mật khẩu.
  5. **Bảo vệ quyền riêng tư ở bước giới thiệu**: Ở ô giới thiệu ngắn tuỳ chọn (`creativeNote`), Zod tự động phát hiện và chặn nếu người dùng vô tình gõ email hoặc số điện thoại cá nhân.

---

### 🔷 3. Thông Báo Lỗi Inline Rõ Ràng Bằng Tiếng Việt

- Ngay bên dưới từng trường dữ liệu đều hiển thị dòng thông báo lỗi trực tiếp (`<p role="alert" className="text-[11px] font-medium text-destructive">`) kèm viền đỏ `border-destructive` và thuộc tính trợ năng `aria-invalid="true"`.
- Thông báo lỗi cụ thể theo đúng nguyên nhân bằng **tiếng Việt tự nhiên, dễ hiểu**, ví dụ:
  - *"Vui lòng nhập tên đăng nhập."* / *"Tên đăng nhập không được chứa khoảng trắng."*
  - *"Tên đăng nhập phải bắt đầu và kết thúc bằng chữ cái hoặc chữ số."*
  - *"Mật khẩu cần bao gồm ít nhất 1 chữ cái và 1 chữ số."*
  - *"Mật khẩu không được trùng với tên đăng nhập."*
  - *"Mật khẩu xác nhận không khớp với mật khẩu đã nhập."*
  - *"Để bảo vệ quyền riêng tư, vui lòng không nhập email hoặc số điện thoại cá nhân."*
- Khi người dùng chuyển ngôn ngữ trên Header (`VI ↔ EN`), các thông báo lỗi đang hiển thị cũng tự động chuyển ngữ tức thời nhờ cơ chế kích hoạt lại `trigger()` theo `locale`.

---

### 🔷 4. Form Đăng Ký Nhiều Bước Giữ Dữ Liệu, Có Thanh Tiến Trình & Bước "Bạn Là Ai?" Không Bắt Buộc

Form đăng ký tại `/register` ([auth-form.tsx](src/components/auth/auth-form.tsx)) được thiết kế thành **Wizard 3 bước** với thanh tiến trình trực quan (`role="progressbar"`, hiển thị phần trăm `33% → 67% → 100%` và thẻ trạng thái từng bước):

- **Bước 1 — Tài khoản (`Bắt buộc`)**:
  - Nhập `Tên đăng nhập`, `Mật khẩu` và `Xác nhận mật khẩu`.
  - Bấm **Tiếp tục** sẽ chạy `trigger(["username", "password", "confirmPassword"])`; chỉ khi hợp lệ 100% mới chuyển sang Bước 2.
- **Bước 2 — "Bạn là ai?" (`Không bắt buộc · Có thể bỏ qua`)**:
  - Hỏi nhẹ nhàng *"Bạn là ai khi ghé thăm naut.frame?"* với các lựa chọn vai trò sáng tạo phi định danh (*Nhiếp ảnh gia*, *Nhà thiết kế*, *Người sưu tầm khung hình*, *Sinh viên / Học viên*, *Người dạo chơi tự do*), chọn tối đa 3 chủ đề ảnh yêu thích, viết đôi dòng giới thiệu ngắn (≤ 120 ký tự) và bật/tắt hiển thị tên tác giả ảnh.
  - **Hoàn toàn không bắt buộc điền**: Người dùng có thể để trống hoặc bấm nút **"Bỏ qua bước này"** để chuyển thẳng sang Bước 3. Dữ liệu bước này chỉ lưu cục bộ trên trình duyệt để giữ đúng nguyên tắc không thu thập thông tin cá nhân định danh trên máy chủ.
- **Bước 3 — Hoàn tất & Kiểm tra lại**:
  - Tóm tắt lại tên tài khoản, mục *"Bạn là ai?"* (hiển thị *"Chưa chọn (Đã bỏ qua)"* nếu người dùng bỏ qua) và các tuỳ chọn.
  - **Giữ nguyên 100% dữ liệu khi chuyển bước**: Cấu hình `shouldUnregister: false` giúp người dùng bấm **Quay lại** hoặc bấm nút **Sửa** để quay về Bước 1 / Bước 2 mà không bị mất bất kỳ ký tự nào đã nhập.

---

### 🔷 5. UX Khi Gửi Form: Khoá Nút Submit & Chặn Gửi Khi Còn Lỗi

- **Không gửi khi còn lỗi**:
  - Ở các bước trung gian, phím `Enter` và nút **Tiếp tục** đều qua kiểm tra `trigger()` từng bước; nếu còn lỗi, form tự động focus vào ô lỗi đầu tiên và linh vật lắc đầu báo hiệu thay vì gửi dữ liệu.
  - Ở bước cuối, nút gửi được khoá (`disabled`) ngay khi phát hiện `errors` còn tồn tại, đồng thời hàm `handleSubmit(onSubmit)` của React Hook Form chặn triệt để mọi request HTTP nếu schema Zod chưa hợp lệ.
- **Khoá nút khi đang gửi (`isSubmitting`)**:
  - Ngay khi bắt đầu gửi API, nút bấm chuyển sang trạng thái `disabled={isSubmitting}`, hiển thị biểu tượng xoay `Loader2` và đổi nhãn thành *"Đang tạo tài khoản..."* / *"Đang đăng nhập..."* / *"Đang lưu..."*, ngăn chặn hoàn toàn lỗi bấm đúp (double-submit).

---

## 🛠️ Hướng Dẫn Chạy & Kiểm Thử Dự Án

```bash
# 1. Tạo tệp biến môi trường từ mẫu
cp .env.example .env

# 2. Cài đặt dependencies
pnpm install

# 3. Đồng bộ schema lên Neon PostgreSQL & khởi tạo tài khoản Admin mẫu (tuỳ chọn)
pnpm db:push
pnpm db:seed

# 4. Chạy máy chủ phát triển (http://localhost:3000)
pnpm dev

# 5. Kiểm tra TypeScript, Clean Architecture, Unit Test Form/Zod & Build Production
pnpm qc
pnpm lint
pnpm build
```
