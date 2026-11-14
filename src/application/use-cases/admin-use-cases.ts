import type {
  AdminUserSummary,
  LikeAuditEntry,
  PlatformStats,
  User,
  UserRole,
} from "@/domain/entities/models";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-errors";
import type {
  IAvatarStorageService,
  IImageFeedOrchestrator,
  IPostRepository,
  IUserRepository,
} from "@/domain/repositories/ports";

function assertAdmin(actor: Pick<User, "role"> | null | undefined): void {
  if (!actor || actor.role !== "ADMIN") {
    throw new ForbiddenError("This action is restricted to Administrators.");
  }
}

export class AdminListUsersUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(
    actor: Pick<User, "role">,
    search?: string,
  ): Promise<AdminUserSummary[]> {
    assertAdmin(actor);
    return this.userRepo.listAdminUserSummaries(search?.trim() || undefined);
  }
}

export class AdminManageUserUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: {
    actor: Pick<User, "id" | "role">;
    targetUserId: string;
    role?: UserRole;
    isActive?: boolean;
  }): Promise<void> {
    assertAdmin(input.actor);

    const target = await this.userRepo.findById(input.targetUserId);
    if (!target) {
      throw new NotFoundError("Target user not found.");
    }

    if (input.actor.id === target.id && input.isActive === false) {
      throw new ValidationError("Administrators cannot lock their own account.");
    }

    if (
      target.role === "ADMIN" &&
      (input.role === "USER" || input.isActive === false)
    ) {
      const adminCount = await this.userRepo.countAdmins();
      if (adminCount <= 1) {
        throw new ValidationError(
          "Cannot demote or lock the sole Administrator of the platform.",
        );
      }
    }

    await this.userRepo.updateAdminUserState(target.id, {
      role: input.role,
      isActive: input.isActive,
    });
  }
}

export class AdminDeleteUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly avatarStorage: IAvatarStorageService,
  ) {}

  async execute(input: {
    actor: Pick<User, "id" | "role">;
    targetUserId: string;
  }): Promise<void> {
    assertAdmin(input.actor);

    if (input.actor.id === input.targetUserId) {
      throw new ValidationError(
        "Administrators cannot delete their own account.",
      );
    }

    const target = await this.userRepo.findById(input.targetUserId);
    if (!target) {
      throw new NotFoundError("User not found.");
    }

    if (target.role === "ADMIN") {
      const adminCount = await this.userRepo.countAdmins();
      if (adminCount <= 1) {
        throw new ValidationError(
          "Cannot delete the sole Administrator of the platform.",
        );
      }
    }

    // Free the single Cloudinary slot before deleting user row
    if (target.avatarPublicId) {
      await this.avatarStorage.deleteUserAvatar(target.avatarPublicId);
    }

    await this.userRepo.deleteById(target.id);
  }
}

export class AdminGetPlatformStatsUseCase {
  constructor(
    private readonly postRepo: IPostRepository,
    private readonly orchestrator: IImageFeedOrchestrator,
  ) {}

  async execute(actor: Pick<User, "role">): Promise<PlatformStats> {
    assertAdmin(actor);
    const [coreStats, quota] = await Promise.all([
      this.postRepo.getPlatformStats(),
      this.orchestrator.getQuotaHealth(),
    ]);
    return {
      ...coreStats,
      quota,
    };
  }
}

export class AdminListLikeAuditLogsUseCase {
  constructor(private readonly postRepo: IPostRepository) {}

  async execute(
    actor: Pick<User, "role">,
    limit = 100,
  ): Promise<LikeAuditEntry[]> {
    assertAdmin(actor);
    const safeLimit = Math.min(Math.max(limit, 1), 250);
    return this.postRepo.listLikeAuditLogs(safeLimit);
  }
}
