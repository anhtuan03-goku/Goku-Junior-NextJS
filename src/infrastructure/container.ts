import "server-only";
import {
  AdminDeleteUserUseCase,
  AdminGetPlatformStatsUseCase,
  AdminListLikeAuditLogsUseCase,
  AdminListUsersUseCase,
  AdminManageUserUseCase,
} from "@/application/use-cases/admin-use-cases";
import {
  GetAuthenticatedUserUseCase,
  LoginAdminUseCase,
  LoginUserUseCase,
  RegisterUserUseCase,
} from "@/application/use-cases/auth-use-cases";
import {
  BrowseInfiniteImagesUseCase,
  GetPhotographerDetailUseCase,
  ListMySavedImagesUseCase,
  SaveImageUseCase,
  UnsaveImageUseCase,
} from "@/application/use-cases/image-use-cases";
import {
  CreatePostUseCase,
  DeletePostUseCase,
  ListPublicPostsUseCase,
  TogglePostLikeUseCase,
  UpdatePostUseCase,
} from "@/application/use-cases/post-use-cases";
import {
  ChangePasswordUseCase,
  RemoveAvatarUseCase,
  UpdateAvatarUseCase,
  UpdatePhotographerModeUseCase,
  UpdateUsernameUseCase,
} from "@/application/use-cases/profile-use-cases";
import { getEnv } from "./config/env";
import {
  ImageProviderRegistry,
  PicsumRandomProvider,
} from "./providers/picsum-provider";
import { PostgresQuotaPersistenceStore } from "./providers/quota-store";
import { UnsplashImageProvider } from "./providers/unsplash-provider";
import { UnsplashQuotaWorker } from "./providers/unsplash-quota-worker";
import { PostgresPostRepository } from "./repositories/postgres-post-repository";
import { PostgresSavedImageRepository } from "./repositories/postgres-saved-image-repository";
import { PostgresUserRepository } from "./repositories/postgres-user-repository";
import { JoseSessionTokenService } from "./security/jwt-session";
import { BcryptPasswordHasher } from "./security/password-hasher";
import { CloudinarySingleSlotStorage } from "./storage/cloudinary-avatar-storage";

function buildContainer() {
  const env = getEnv();

  // Repositories
  const userRepo = new PostgresUserRepository();
  const savedImageRepo = new PostgresSavedImageRepository();
  const postRepo = new PostgresPostRepository();
  const quotaStore = new PostgresQuotaPersistenceStore();

  // External Services & Security
  const passwordHasher = new BcryptPasswordHasher();
  const tokenService = new JoseSessionTokenService();
  const avatarStorage = new CloudinarySingleSlotStorage();

  // Extensible Multi-Provider Registry + 50 req/hr Quota Worker
  const unsplashProvider = new UnsplashImageProvider();
  const picsumProvider = new PicsumRandomProvider();
  const providerRegistry = new ImageProviderRegistry()
    .register(unsplashProvider)
    .register(picsumProvider);

  const feedOrchestrator = new UnsplashQuotaWorker(
    unsplashProvider,
    providerRegistry,
    quotaStore,
    savedImageRepo,
    env.ENABLE_SECONDARY_PROVIDER === "true",
  );

  return {
    providerRegistry,
    useCases: {
      // Auth
      registerUser: new RegisterUserUseCase(
        userRepo,
        passwordHasher,
        tokenService,
      ),
      loginUser: new LoginUserUseCase(userRepo, passwordHasher, tokenService),
      loginAdmin: new LoginAdminUseCase(userRepo, passwordHasher, tokenService),
      getAuthenticatedUser: new GetAuthenticatedUserUseCase(
        userRepo,
        tokenService,
      ),

      // Profile
      updateUsername: new UpdateUsernameUseCase(userRepo, tokenService),
      changePassword: new ChangePasswordUseCase(
        userRepo,
        passwordHasher,
        tokenService,
      ),
      updatePhotographerMode: new UpdatePhotographerModeUseCase(userRepo),
      updateAvatar: new UpdateAvatarUseCase(userRepo, avatarStorage),
      removeAvatar: new RemoveAvatarUseCase(userRepo, avatarStorage),

      // Images & Photographers
      browseInfiniteImages: new BrowseInfiniteImagesUseCase(feedOrchestrator),
      getPhotographerDetail: new GetPhotographerDetailUseCase(feedOrchestrator),
      saveImage: new SaveImageUseCase(savedImageRepo, feedOrchestrator),
      unsaveImage: new UnsaveImageUseCase(savedImageRepo),
      listMySavedImages: new ListMySavedImagesUseCase(savedImageRepo),

      // Posts & Anonymous Likes
      createPost: new CreatePostUseCase(savedImageRepo, postRepo),
      updatePost: new UpdatePostUseCase(postRepo),
      deletePost: new DeletePostUseCase(postRepo),
      listPublicPosts: new ListPublicPostsUseCase(postRepo),
      togglePostLike: new TogglePostLikeUseCase(postRepo),

      // Admin
      adminListUsers: new AdminListUsersUseCase(userRepo),
      adminManageUser: new AdminManageUserUseCase(userRepo),
      adminDeleteUser: new AdminDeleteUserUseCase(userRepo, avatarStorage),
      adminGetStats: new AdminGetPlatformStatsUseCase(
        postRepo,
        feedOrchestrator,
      ),
      adminListLikeLogs: new AdminListLikeAuditLogsUseCase(postRepo),
    },
  };
}

type AppContainer = ReturnType<typeof buildContainer>;

declare global {
  var __gokuAppContainer: AppContainer | undefined;
}

export function getContainer(): AppContainer {
  if (!globalThis.__gokuAppContainer) {
    globalThis.__gokuAppContainer = buildContainer();
  }
  return globalThis.__gokuAppContainer;
}
