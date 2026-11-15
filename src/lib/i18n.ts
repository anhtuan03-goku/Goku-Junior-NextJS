export type Locale = "vi" | "en";

export const LOCALE_COOKIE_NAME = "naut_locale";
export const LOCALE_STORAGE_KEY = "naut_locale";
export const PERSONA_STORAGE_KEY = "naut_persona_prefs_v1";

export type PersonaId =
  | ""
  | "photographer"
  | "designer"
  | "collector"
  | "student"
  | "explorer";

export interface LocalPersonaPreference {
  persona: PersonaId;
  favoriteThemes: string[];
  creativeNote: string;
  updatedAt: string;
}

export function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "vi" || lower.startsWith("vi-") || lower.startsWith("vi_")) {
    return "vi";
  }
  if (lower === "en" || lower.startsWith("en-") || lower.startsWith("en_")) {
    return "en";
  }
  return null;
}

/**
 * Parses an HTTP Accept-Language header and returns the best matching locale.
 */
export function detectLocaleFromAcceptLanguage(
  headerValue: string | null | undefined,
): Locale {
  if (!headerValue) return "vi";

  const candidates = headerValue
    .split(",")
    .map((part) => {
      const [langPart, qPart] = part.trim().split(";q=");
      const q = qPart ? Number.parseFloat(qPart) : 1;
      return {
        lang: (langPart ?? "").trim().toLowerCase(),
        q: Number.isFinite(q) ? q : 0,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const item of candidates) {
    if (item.lang.startsWith("vi")) return "vi";
    if (item.lang.startsWith("en")) return "en";
  }

  return "vi";
}

/**
 * Client-side automatic locale detection:
 * Checks browser languages first, and also checks Vietnam/ICT timezone so
 * Vietnamese users using an en-US browser build still get automatic Vietnamese UI
 * on their first visit (until they manually toggle EN/VI).
 */
export function detectBrowserLocaleClient(): Locale {
  if (typeof window === "undefined") return "vi";

  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const lang of languages) {
    if (lang?.toLowerCase().startsWith("vi")) {
      return "vi";
    }
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === "Asia/Ho_Chi_Minh" || tz === "Asia/Saigon") {
      return "vi";
    }
  } catch {
    // Ignore Intl errors
  }

  for (const lang of languages) {
    if (lang?.toLowerCase().startsWith("en")) {
      return "en";
    }
  }

  return "vi";
}

export function saveUserPersonaPreference(
  username: string,
  pref: Omit<LocalPersonaPreference, "updatedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    const map = raw
      ? (JSON.parse(raw) as Record<string, LocalPersonaPreference>)
      : {};
    map[username.trim().toLowerCase()] = {
      ...pref,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PERSONA_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadUserPersonaPreference(
  username: string,
): LocalPersonaPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, LocalPersonaPreference>;
    return map[username.trim().toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

export const PERSONA_OPTIONS: Array<{
  id: Exclude<PersonaId, "">;
  label: Record<Locale, string>;
  desc: Record<Locale, string>;
}> = [
  {
    id: "photographer",
    label: { vi: "Nhiếp ảnh gia", en: "Photographer" },
    desc: {
      vi: "Săn tìm bố cục, ánh sáng và góc máy tối giản",
      en: "Capturing light, framing, and minimalist composition",
    },
  },
  {
    id: "designer",
    label: { vi: "Nhà thiết kế / Sáng tạo", en: "Designer / Creative" },
    desc: {
      vi: "Tìm kiếm moodboard, bảng màu và cảm hứng thị giác",
      en: "Collecting moodboards, palettes, and visual inspiration",
    },
  },
  {
    id: "collector",
    label: { vi: "Người sưu tầm khung hình", en: "Visual Collector" },
    desc: {
      vi: "Lưu giữ ảnh đẹp và viết nhật ký cá nhân tĩnh lặng",
      en: "Curating inspiring frames and quiet personal journals",
    },
  },
  {
    id: "student",
    label: { vi: "Sinh viên / Học viên", en: "Student / Learner" },
    desc: {
      vi: "Học tập, nghiên cứu nghệ thuật và khám phá vũ trụ",
      en: "Studying visual arts, design, and cosmic archives",
    },
  },
  {
    id: "explorer",
    label: { vi: "Người dạo chơi tự do", en: "Casual Explorer" },
    desc: {
      vi: "Thưởng thức không gian ảnh không ồn ào, không bình luận",
      en: "Enjoying a calm, distraction-free visual stream",
    },
  },
];

export const VISUAL_THEME_OPTIONS: Array<{
  id: string;
  label: Record<Locale, string>;
}> = [
  { id: "minimalism", label: { vi: "Tối giản", en: "Minimalism" } },
  { id: "architecture", label: { vi: "Kiến trúc", en: "Architecture" } },
  { id: "nature", label: { vi: "Thiên nhiên", en: "Nature" } },
  { id: "cosmos", label: { vi: "Vũ trụ NASA", en: "NASA Cosmos" } },
  { id: "street", label: { vi: "Đường phố", en: "Street" } },
  { id: "monochrome", label: { vi: "Đơn sắc", en: "Monochrome" } },
];

export const UI_STRINGS = {
  vi: {
    nav: {
      explore: "Khám phá",
      space: "Vũ trụ",
      community: "Cộng đồng",
      saved: "Đã lưu",
      admin: "Quản trị",
      author: "Tác giả",
      authorOnTitle: "Tên nhiếp ảnh gia: Đang bật (nhấn để ẩn)",
      authorOffTitle: "Tên nhiếp ảnh gia: Đang tắt (nhấn để hiện)",
      toggleTheme: "Chuyển chế độ sáng hoặc tối",
      toggleLang: "Chuyển sang tiếng Anh (Switch to English)",
      settings: "Cài đặt tài khoản",
      signIn: "Đăng nhập",
      signUp: "Đăng ký",
      signOut: "Đăng xuất",
      primaryNav: "Điều hướng chính",
      mobileNav: "Điều hướng di động",
    },
    footer: {
      tagline: "Nhật ký thị giác tối giản.",
      community: "Cộng đồng",
      privacy: "Chính sách bảo mật Zero-PII",
    },
    auth: {
      signInTab: "Đăng nhập",
      signUpTab: "Đăng ký",
      loginTitle: "Chào mừng trở lại",
      loginSubtitle:
        "Đăng nhập để truy cập bộ sưu tập khung hình và nhật ký thị giác của bạn.",
      registerTitle: "Tạo tài khoản naut.frame",
      registerSubtitle:
        "Khởi tạo không gian lưu trữ ảnh tối giản chỉ trong 3 bước ngắn.",
      stepAccount: "Tài khoản",
      stepWhoAreYou: "Bạn là ai?",
      stepConfirm: "Hoàn tất",
      stepProgressLabel: "Tiến trình đăng ký",
      optionalBadge: "Không bắt buộc",
      usernameLabel: "Tên đăng nhập",
      usernamePlaceholder: "vd: naut_minimal",
      passwordLabel: "Mật khẩu",
      passwordRegisterPlaceholder: "Ít nhất 8 ký tự (gồm chữ & số)",
      confirmPasswordLabel: "Xác nhận mật khẩu",
      confirmPasswordPlaceholder: "Nhập lại mật khẩu",
      matchedBadge: "Đã khớp",
      showPassword: "Hiện mật khẩu",
      hidePassword: "Ẩn mật khẩu",
      whoAreYouQuestion: "Bạn là ai khi ghé thăm naut.frame?",
      whoAreYouHint:
        "Bước này hoàn toàn tự nguyện — bạn có thể chọn hoặc bấm Bỏ qua ngay. Lựa chọn chỉ lưu trên trình duyệt của bạn.",
      themesLabel: "Chủ đề thị giác yêu thích (tối đa 3)",
      creativeNoteLabel: "Đôi dòng giới thiệu ngắn (tuỳ chọn)",
      creativeNotePlaceholder:
        "VD: Yêu thích ảnh kiến trúc tối giản và bầu trời đêm...",
      photographerToggleLabel: "Hiển thị tên nhiếp ảnh gia trên khung ảnh",
      photographerToggleHint:
        "Bạn có thể bật/tắt lại bất cứ lúc nào trên thanh điều hướng.",
      reviewTitle: "Kiểm tra thông tin trước khi tạo",
      reviewAccountRow: "Tài khoản",
      reviewPersonaRow: "Bạn là ai?",
      reviewPersonaSkipped: "Chưa chọn (Đã bỏ qua)",
      reviewThemesRow: "Chủ đề yêu thích",
      reviewThemesSkipped: "Mặc định tất cả chủ đề",
      reviewAuthorModeRow: "Hiển thị tác giả ảnh",
      reviewAuthorOn: "Đang bật",
      reviewAuthorOff: "Ẩn tối giản",
      editStepBtn: "Sửa",
      backBtn: "Quay lại",
      skipBtn: "Bỏ qua bước này",
      nextBtn: "Tiếp tục",
      createAccountBtn: "Hoàn tất đăng ký",
      creatingAccountBtn: "Đang tạo tài khoản...",
      signInBtn: "Đăng nhập",
      signingInBtn: "Đang đăng nhập...",
      welcomeRegisterToast: "Chào mừng @{username}! Tài khoản của bạn đã sẵn sàng.",
      welcomeLoginToast: "Chào mừng trở lại, @{username}!",
    },
    adminLogin: {
      badge: "Cổng Quản Trị · Giới Hạn Truy Cập",
      title: "Đăng nhập Quản trị viên",
      subtitle:
        "Cổng xác thực dành riêng cho quản trị hệ thống, giám sát hạn ngạch API và nhật ký kiểm duyệt.",
      currentMemberNote:
        "Bạn đang đăng nhập bằng tài khoản thành viên @{username}. Vui lòng xác thực bằng tài khoản Quản trị viên bên dưới để chuyển phiên.",
      usernameLabel: "Tài khoản Admin",
      usernamePlaceholder: "Tên đăng nhập quản trị viên",
      passwordLabel: "Mật khẩu Admin",
      submitBtn: "Vào Bảng Điều Khiển Admin",
      submittingBtn: "Đang xác thực...",
      backToMemberLogin: "Quay lại đăng nhập thành viên",
    },
    explore: {
      empty: "Hiện chưa có khung hình nào. Vui lòng tải lại sau giây lát.",
      loadingMore: "Đang tải thêm khung hình",
    },
    space: {
      searchPlaceholder:
        "Tìm kiếm kho lưu trữ vũ trụ NASA (vd: nebula, james webb, apollo, black hole)...",
      searchBtn: "Tìm kiếm",
      clearSearch: "Xoá từ khoá tìm kiếm",
      emptyTitle: "Không tìm thấy hình ảnh vũ trụ phù hợp",
      emptySubtitle:
        "Kho dữ liệu NASA không trả về kết quả nào cho từ khoá này. Hãy thử từ khoá tiếng Anh khác hoặc chọn chủ đề gợi ý phía trên.",
      topics: {
        "": "Vũ trụ nổi bật",
        nebula: "Tinh vân",
        "james webb": "Kính James Webb",
        "hubble galaxy": "Kính Hubble",
        "spiral galaxy": "Thiên hà xoắn ốc",
        "saturn cassini": "Sao Thổ",
        "apollo moon": "Sứ mệnh Apollo",
        supernova: "Siêu tân tinh",
      } as Record<string, string>,
    },
    imageCard: {
      save: "Lưu",
      saveFrame: "Lưu khung hình",
      saved: "Đã lưu",
      removeSaved: "Bỏ lưu khung hình",
      profileLink: "Hồ sơ →",
      authorProfile: "Hồ sơ tác giả",
      authorHidden: "Thông tin tác giả đang được ẩn",
      writePost: "Viết bài",
      signInToSave: "Vui lòng đăng nhập để lưu khung hình vào bộ sưu tập.",
      savedSuccess: "Đã lưu vào bộ sưu tập cá nhân.",
      removedSuccess: "Đã xoá khỏi danh sách khung hình đã lưu.",
    },
    community: {
      heading: "Nhật Ký Cộng Đồng",
      subheading:
        "Không bình luận ồn ào, không thông báo làm phiền — chỉ có những câu chuyện thị giác công khai và sự đồng điệu ẩn danh.",
      emptyTitle: "Chưa có câu chuyện công khai nào",
      emptySubtitle:
        "Hãy lưu một khung hình truyền cảm hứng và chia sẻ câu chuyện Công khai đầu tiên với cộng đồng.",
      photoBy: "Ảnh bởi ",
      signInToHeart: "Vui lòng đăng nhập để thả tim ẩn danh.",
      loadingMore: "Đang tải thêm câu chuyện...",
    },
    saved: {
      heading: "Khung Hình Đã Lưu & Câu Chuyện",
      subheading:
        "Chọn bất kỳ khung hình nào để viết nhiều câu chuyện độc lập, chỉnh sửa ghi chú hoặc chuyển đổi Riêng tư ↔ Công khai bất cứ lúc nào.",
      emptyTitle: "Bộ sưu tập đã lưu đang trống",
      emptySubtitle:
        "Hãy khám phá các khung hình tối giản và lưu lại khoảnh khắc chạm đến cảm xúc của bạn để bắt đầu viết nhật ký.",
      exploreBtn: "Khám phá khung hình",
      storySingular: "câu chuyện",
      storyPlural: "câu chuyện",
      publicBadge: "Công khai",
      privateBadge: "Riêng tư",
      writeManage: "Viết / Quản lý →",
      studioTitle: "Xưởng Viết Câu Chuyện (Story Studio)",
      studioDesc:
        "Viết nhiều câu chuyện độc lập trên cùng một khung hình, chỉnh sửa cảm nhận hoặc chuyển đổi Riêng tư ↔ Công khai.",
      unsaveBtn: "Bỏ lưu khung hình (xoá {count} câu chuyện)",
      newStoryTitle: "Câu chuyện mới cho khung hình này",
      privateBtn: "Riêng tư",
      publicBtn: "Công khai",
      storyPlaceholder:
        "Ghi lại suy ngẫm, tâm trạng hoặc câu chuyện được gợi mở từ khung hình này...",
      charactersCount: "ký tự",
      saveStoryBtn: "Lưu câu chuyện",
      savingStoryBtn: "Đang lưu...",
      storiesListHeading: "Danh sách câu chuyện trên khung hình ({count})",
      noStoriesYet: "Chưa có câu chuyện nào được viết cho khung hình này.",
      publicClickToHide: "Công khai (Nhấn để ẩn)",
      privateClickToPublish: "Riêng tư (Nhấn để công khai)",
      heartSingular: "tim",
      heartPlural: "tim",
      editBtn: "Sửa",
      deleteBtn: "Xoá",
      cancelBtn: "Huỷ",
      saveChangesBtn: "Lưu thay đổi",
    },
    settings: {
      heading: "Cài Đặt Hồ Sơ",
      subheading:
        "Quản lý tên đăng nhập duy nhất, mật khẩu, vai trò sáng tạo, hiển thị tác giả ảnh và ảnh đại diện.",
      avatarTitle: "Ảnh đại diện (Lưu trữ 1 ô duy nhất trên Cloudinary)",
      avatarDesc:
        "Ảnh được tự động cắt vuông và nén sang WebP siêu nhẹ ngay trên trình duyệt trước khi tải lên. Cập nhật mới sẽ tự động thu hồi ảnh cũ.",
      chooseAvatarBtn: "Chọn & nén ảnh",
      removeAvatarBtn: "Xoá ảnh đại diện",
      photographerTitle: "Hiển thị tên nhiếp ảnh gia trên khung ảnh",
      photographerDesc:
        "Khi bật, mỗi khung ảnh sẽ hiển thị tên nhiếp ảnh gia cùng liên kết đến trang hồ sơ tác phẩm của họ.",
      personaTitle: "Bạn là ai? (Tuỳ chọn cá nhân hoá trên trình duyệt)",
      personaDesc:
        "Không bắt buộc điền — chỉ lưu cục bộ trên thiết bị này để giữ trọn chuẩn bảo mật không thu thập dữ liệu định danh.",
      savePersonaBtn: "Lưu giới thiệu",
      usernameTitle: "Đổi tên đăng nhập (Duy nhất)",
      usernameDesc:
        "Chỉ gồm chữ thường không dấu, chữ số và các ký tự . _ - (từ 3 đến 32 ký tự).",
      saveUsernameBtn: "Lưu tên đăng nhập",
      passwordTitle: "Đổi mật khẩu bảo mật",
      passwordDesc:
        "Khi đổi mật khẩu, mọi phiên đăng nhập đang mở trên thiết bị khác sẽ lập tức bị thu hồi.",
      currentPasswordLabel: "Mật khẩu hiện tại",
      newPasswordLabel: "Mật khẩu mới (ít nhất 8 ký tự, gồm chữ & số)",
      confirmNewPasswordLabel: "Xác nhận mật khẩu mới",
      updatePasswordBtn: "Cập nhật mật khẩu",
    },
    privacy: {
      backExplore: "Quay lại Khám phá",
      eyebrow: "naut.frame · Kiến Trúc Quyền Riêng Tư",
      title: "Chính Sách Bảo Mật Zero-PII",
      intro:
        "naut.frame được xây dựng dựa trên một nguyên lý giản dị: hệ thống không thể làm lộ, bán hay rò rỉ dữ liệu cá nhân mà ngay từ đầu chưa từng thu thập.",
      pillars: [
        {
          title: "Không Thu Thập Thông Tin Định Danh (Zero-PII)",
          body: "Đăng ký và đăng nhập chỉ yêu cầu duy nhất tên đăng nhập chữ thường và mật khẩu. Hệ thống không bao giờ hỏi hay lưu trữ email, số điện thoại, họ tên thật, vị trí hay mạng xã hội bên thứ ba.",
        },
        {
          title: "Băm Mật Khẩu Một Chiều & Thu Hồi Phiên Tức Thì",
          body: "Mật khẩu không bao giờ lưu dạng văn bản thuần. Mọi mật khẩu đều được băm một chiều bằng bcrypt (cost 12) trước khi ghi vào cơ sở dữ liệu, và việc đổi mật khẩu sẽ vô hiệu hoá ngay lập tức các phiên cũ.",
        },
        {
          title: "Thả Tim Ẩn Danh Tĩnh Lặng",
          body: "Các câu chuyện công khai chỉ hiển thị tổng số lượt tim — không bình luận ồn ào, không thông báo làm phiền và không công khai danh sách người đã thả tim. Nhật ký kiểm duyệt nội bộ chỉ dành riêng cho Quản trị viên.",
        },
        {
          title: "Mặc Định Riêng Tư & Ảnh Đại Diện 1 Ô Lưu Trữ",
          body: "Khung hình đã lưu và bài viết Riêng tư được cô lập hoàn toàn trong tài khoản của bạn. Ảnh đại diện tuỳ chọn được nén sang WebP trên trình duyệt và chỉ chiếm tối đa 1 vị trí lưu trữ trên Cloudinary.",
        },
      ],
      cookiesTitle: "Cookie & Phiên Làm Việc Thiết Yếu",
      cookiesBody:
        "Ứng dụng chỉ sử dụng duy nhất 1 cookie HttpOnly thiết yếu để duy trì phiên đăng nhập cùng bộ nhớ cục bộ lưu chế độ sáng/tối, ngôn ngữ (VI/EN) và tuỳ chọn hiển thị tác giả. Hoàn toàn không có trình theo dõi quảng cáo hay script phân tích hành vi.",
    },
  },
  en: {
    nav: {
      explore: "Explore",
      space: "Space",
      community: "Community",
      saved: "Saved",
      admin: "Admin",
      author: "Author",
      authorOnTitle: "Photographer credits: On (click to hide)",
      authorOffTitle: "Photographer credits: Off (click to show)",
      toggleTheme: "Toggle light or dark theme",
      toggleLang: "Switch language to Vietnamese (Chuyển sang Tiếng Việt)",
      settings: "Profile settings",
      signIn: "Sign in",
      signUp: "Sign up",
      signOut: "Sign out",
      primaryNav: "Primary navigation",
      mobileNav: "Mobile navigation",
    },
    footer: {
      tagline: "Minimalist visual journal.",
      community: "Community",
      privacy: "Zero-PII Privacy Policy",
    },
    auth: {
      signInTab: "Sign in",
      signUpTab: "Sign up",
      loginTitle: "Welcome back",
      loginSubtitle:
        "Sign in to access your saved frames and visual journal.",
      registerTitle: "Create your naut.frame account",
      registerSubtitle:
        "Set up your minimalist visual collection in 3 quick steps.",
      stepAccount: "Account",
      stepWhoAreYou: "Who are you?",
      stepConfirm: "Finish",
      stepProgressLabel: "Registration progress",
      optionalBadge: "Optional",
      usernameLabel: "Username",
      usernamePlaceholder: "e.g. naut_minimal",
      passwordLabel: "Password",
      passwordRegisterPlaceholder: "At least 8 chars (letters & numbers)",
      confirmPasswordLabel: "Confirm password",
      confirmPasswordPlaceholder: "Re-enter your password",
      matchedBadge: "Matched",
      showPassword: "Show password characters",
      hidePassword: "Hide password characters",
      whoAreYouQuestion: "Who are you on naut.frame?",
      whoAreYouHint:
        "Completely optional — pick a creative role or skip right away. Stored locally in your browser only.",
      themesLabel: "Favorite visual themes (up to 3)",
      creativeNoteLabel: "Short creative note (optional)",
      creativeNotePlaceholder:
        "e.g. Drawn to minimalist architecture and deep-sky photography...",
      photographerToggleLabel: "Show photographer attribution on frames",
      photographerToggleHint:
        "You can toggle this anytime from the top header bar.",
      reviewTitle: "Review before creating your account",
      reviewAccountRow: "Account",
      reviewPersonaRow: "Who are you?",
      reviewPersonaSkipped: "Not specified (Skipped)",
      reviewThemesRow: "Visual themes",
      reviewThemesSkipped: "All curated themes",
      reviewAuthorModeRow: "Author attribution",
      reviewAuthorOn: "Enabled",
      reviewAuthorOff: "Hidden (minimalist)",
      editStepBtn: "Edit",
      backBtn: "Back",
      skipBtn: "Skip this step",
      nextBtn: "Continue",
      createAccountBtn: "Create account",
      creatingAccountBtn: "Creating account...",
      signInBtn: "Sign in",
      signingInBtn: "Signing in...",
      welcomeRegisterToast: "Welcome @{username}! Your account is ready.",
      welcomeLoginToast: "Welcome back, @{username}!",
    },
    adminLogin: {
      badge: "Admin Portal · Restricted Access",
      title: "Administrator Sign In",
      subtitle:
        "Dedicated gateway for platform governance, quota telemetry, and moderation audit logs.",
      currentMemberNote:
        "Currently signed in as member @{username}. Authenticate below with an Administrator account to switch sessions.",
      usernameLabel: "Admin username",
      usernamePlaceholder: "Administrator username",
      passwordLabel: "Admin password",
      submitBtn: "Enter Admin Console",
      submittingBtn: "Verifying...",
      backToMemberLogin: "Member sign in",
    },
    explore: {
      empty: "No frames available right now. Please refresh in a moment.",
      loadingMore: "Loading more frames",
    },
    space: {
      searchPlaceholder:
        "Search NASA cosmos (e.g. nebula, james webb, apollo, black hole)...",
      searchBtn: "Search",
      clearSearch: "Clear search query",
      emptyTitle: "No space images available",
      emptySubtitle:
        "NASA returned no cosmic imagery for this query. Try another astronomy keyword or select a topic above.",
      topics: {
        "": "Featured Cosmos",
        nebula: "Nebula",
        "james webb": "James Webb",
        "hubble galaxy": "Hubble",
        "spiral galaxy": "Galaxies",
        "saturn cassini": "Saturn",
        "apollo moon": "Apollo",
        supernova: "Supernova",
      } as Record<string, string>,
    },
    imageCard: {
      save: "Save",
      saveFrame: "Save frame",
      saved: "Saved",
      removeSaved: "Remove from saved frames",
      profileLink: "Profile →",
      authorProfile: "Author profile",
      authorHidden: "Author attribution is currently hidden",
      writePost: "Write post",
      signInToSave: "Please sign in to save frames to your collection.",
      savedSuccess: "Saved to your personal collection.",
      removedSuccess: "Removed from your saved frames.",
    },
    community: {
      heading: "Community Journal",
      subheading:
        "No noisy comments, no distracting notifications — just public visual stories and quiet, anonymous appreciation.",
      emptyTitle: "No public stories yet",
      emptySubtitle:
        "Save an inspiring frame and share the first Public story with the community.",
      photoBy: "Photo by ",
      signInToHeart: "Please sign in to send an anonymous heart.",
      loadingMore: "Loading more stories...",
    },
    saved: {
      heading: "Saved Frames & Stories",
      subheading:
        "Select any saved frame to write multiple stories, edit notes, or switch visibility between Private and Public anytime.",
      emptyTitle: "Your saved collection is empty",
      emptySubtitle:
        "Explore curated frames and save the ones that move you to start writing Private or Public stories.",
      exploreBtn: "Explore frames",
      storySingular: "story",
      storyPlural: "stories",
      publicBadge: "Public",
      privateBadge: "Private",
      writeManage: "Write / Manage →",
      studioTitle: "Story Studio",
      studioDesc:
        "Write multiple independent stories on the same saved frame, refine your notes, or toggle Private ↔ Public anytime.",
      unsaveBtn: "Unsave frame (deletes {count} stories)",
      newStoryTitle: "New story for this frame",
      privateBtn: "Private",
      publicBtn: "Public",
      storyPlaceholder:
        "Capture a reflection, mood, or story inspired by this frame...",
      charactersCount: "characters",
      saveStoryBtn: "Save story",
      savingStoryBtn: "Saving...",
      storiesListHeading: "Stories on this frame ({count})",
      noStoriesYet: "No stories written for this frame yet.",
      publicClickToHide: "Public (Click to hide)",
      privateClickToPublish: "Private (Click to publish)",
      heartSingular: "heart",
      heartPlural: "hearts",
      editBtn: "Edit",
      deleteBtn: "Delete",
      cancelBtn: "Cancel",
      saveChangesBtn: "Save changes",
    },
    settings: {
      heading: "Profile Settings",
      subheading:
        "Manage your unique username, password, creative persona, photographer attribution preferences, and avatar.",
      avatarTitle: "Avatar (Single-Slot Storage)",
      avatarDesc:
        "Your image is center-cropped and compressed to lightweight WebP before uploading to Cloudinary. Updating automatically purges the previous slot.",
      chooseAvatarBtn: "Choose & compress photo",
      removeAvatarBtn: "Remove avatar",
      photographerTitle: "Show photographer attribution on frames",
      photographerDesc:
        "When enabled, each frame displays the photographer's name and a direct link to their curated profile.",
      personaTitle: "Who are you? (Local Browser Preference)",
      personaDesc:
        "Optional — stored only in this browser so your account stays strictly free of personal profiling.",
      savePersonaBtn: "Save preference",
      usernameTitle: "Change Username (Unique)",
      usernameDesc:
        "Lowercase letters, numbers, and . _ - characters only (3–32 characters).",
      saveUsernameBtn: "Save username",
      passwordTitle: "Change Password",
      passwordDesc:
        "Updating your password immediately revokes all active sessions on other devices.",
      currentPasswordLabel: "Current password",
      newPasswordLabel: "New password (at least 8 chars, letters & numbers)",
      confirmNewPasswordLabel: "Confirm new password",
      updatePasswordBtn: "Update password",
    },
    privacy: {
      backExplore: "Back to Explore",
      eyebrow: "naut.frame · Privacy Architecture",
      title: "Zero-PII Privacy Policy",
      intro:
        "We built naut.frame around a simple conviction: you cannot leak, sell, or expose personal data that you never collect in the first place.",
      pillars: [
        {
          title: "Zero Personal Identifiable Information (Zero-PII)",
          body: "Registration and sign-in require only a unique lowercase username and a password. We never ask for, store, or process your email address, phone number, legal name, location, or third-party social graph.",
        },
        {
          title: "One-Way Password Hashing & Instant Session Revocation",
          body: "Passwords are never stored in plain text. Every password is hashed one-way with bcrypt (cost factor 12) before reaching our database, and changing your password immediately invalidates all prior sessions.",
        },
        {
          title: "Quiet & Anonymous Appreciation",
          body: "Public visual stories display only an aggregate heart count—no comment threads, no notification noise, and no public list of who liked a post. Internal moderation audit logs are restricted strictly to system administrators.",
        },
        {
          title: "Private by Default & Single-Slot Avatar Hygiene",
          body: "Saved frames and Private posts remain strictly isolated to your account and can be switched between Private and Public at any time. Optional profile avatars are compressed to WebP in your browser and occupy at most one storage slot—automatically overwritten on update and permanently purged on removal.",
        },
      ],
      cookiesTitle: "Cookies & Essential Session State",
      cookiesBody:
        "We use a single essential HttpOnly session cookie to keep you signed in and local preference keys to remember your theme, language (EN/VI), and photographer-credit toggle. Zero advertising trackers, zero fingerprinting scripts, and zero behavioral analytics are loaded on any page.",
    },
  },
} as const;

const EXACT_API_MESSAGE_VI_MAP: Record<string, string> = {
  "Username is already taken.":
    "Tên đăng nhập này đã có người sử dụng. Vui lòng chọn tên khác.",
  "Username is already taken. Please choose another.":
    "Tên đăng nhập này đã có người sử dụng. Vui lòng chọn tên khác.",
  "Invalid username or password.":
    "Tên đăng nhập hoặc mật khẩu không chính xác.",
  "Invalid administrator credentials.":
    "Thông tin xác thực Quản trị viên không hợp lệ.",
  "Your account has been locked by an administrator.":
    "Tài khoản của bạn đã bị khoá bởi Quản trị viên.",
  "Current password is incorrect.": "Mật khẩu hiện tại không chính xác.",
  "Please sign in to continue.": "Vui lòng đăng nhập để tiếp tục.",
  "This area is restricted to Administrators.":
    "Khu vực này chỉ dành riêng cho Quản trị viên.",
  "Unable to authenticate your account.":
    "Không thể xác thực tài khoản. Vui lòng thử lại.",
  "Something went wrong.": "Đã xảy ra lỗi. Vui lòng thử lại.",
  "An unexpected server error occurred. Please try again shortly.":
    "Máy chủ đang bận. Vui lòng thử lại sau giây lát.",
  "Too many requests. Please slow down and try again shortly.":
    "Bạn thao tác quá nhanh. Vui lòng đợi ít giây rồi thử lại.",
  "Signed out.": "Đã đăng xuất thành công.",
  "Photographer attribution enabled.":
    "Đã bật hiển thị tên nhiếp ảnh gia.",
  "Photographer attribution hidden.":
    "Đã ẩn tên nhiếp ảnh gia.",
  "Photographer attribution hidden (pure minimalist view).":
    "Đã ẩn tên nhiếp ảnh gia (chế độ khung hình tối giản).",
};

/**
 * Automatically translates server/API messages and dynamic notifications
 * into Vietnamese when `locale === "vi"`, preserving English when `locale === "en"`.
 */
export function autoTranslateMessage(message: string, locale: Locale): string {
  if (!message || locale === "en") return message;

  const trimmed = message.trim();
  const exact = EXACT_API_MESSAGE_VI_MAP[trimmed];
  if (exact) return exact;

  if (/already taken/i.test(trimmed)) {
    return "Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.";
  }
  if (/invalid username or password/i.test(trimmed)) {
    return "Tên đăng nhập hoặc mật khẩu không chính xác.";
  }
  if (/current password/i.test(trimmed) && /incorrect/i.test(trimmed)) {
    return "Mật khẩu hiện tại không chính xác.";
  }
  if (/too many requests|rate limit/i.test(trimmed)) {
    return "Quá nhiều yêu cầu liên tiếp. Vui lòng thử lại sau ít giây.";
  }
  if (/locked/i.test(trimmed)) {
    return "Tài khoản này hiện đang bị tạm khoá.";
  }

  return message;
}
