import type { SafeUserDTO } from "@/domain/entities/models";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors/domain-errors";
import type {
  IAvatarStorageService,
  IPasswordHasher,
  ISessionTokenService,
  IUserRepository,
} from "@/domain/repositories/ports";
import {
  normalizeAndValidateUsername,
  toSafeUserDTO,
  validatePassword,
} from "../dtos/mappers";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB hard server cap

export class UpdateUsernameUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenService: ISessionTokenService,
  ) {}

  async execute(input: {
    userId: string;
    newUsername: string;
  }): Promise<{ user: SafeUserDTO; token: string }> {
    const normalized = normalizeAndValidateUsername(input.newUsername);
    const current = await this.userRepo.findById(input.userId);
    if (!current) throw new NotFoundError("Không tìm thấy người dùng.");

    if (current.username !== normalized) {
      const taken = await this.userRepo.findByUsername(normalized);
      if (taken && taken.id !== input.userId) {
        throw new ConflictError("Tên đăng nhập này đã được sử dụng.");
      }
    }

    const updated = await this.userRepo.updateUsername(input.userId, normalized);
    const token = await this.tokenService.sign({
      sub: updated.id,
      username: updated.username,
      role: updated.role,
      sv: updated.sessionVersion,
    });

    return { user: toSafeUserDTO(updated), token };
  }
}

export class ChangePasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ISessionTokenService,
  ) {}

  async execute(input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ user: SafeUserDTO; token: string }> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng.");

    const ok = await this.passwordHasher.verify(
      input.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      throw new UnauthorizedError("Mật khẩu hiện tại không chính xác.");
    }

    const validatedNew = validatePassword(input.newPassword);
    const newHash = await this.passwordHasher.hash(validatedNew);
    const updated = await this.userRepo.updatePassword(input.userId, newHash);

    const token = await this.tokenService.sign({
      sub: updated.id,
      username: updated.username,
      role: updated.role,
      sv: updated.sessionVersion,
    });

    return { user: toSafeUserDTO(updated), token };
  }
}

export class UpdatePhotographerModeUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: {
    userId: string;
    showPhotographerInfo: boolean;
  }): Promise<SafeUserDTO> {
    const updated = await this.userRepo.updatePhotographerMode(
      input.userId,
      input.showPhotographerInfo,
    );
    return toSafeUserDTO(updated);
  }
}

export class UpdateAvatarUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly avatarStorage: IAvatarStorageService,
  ) {}

  async execute(input: {
    userId: string;
    fileBuffer: Buffer;
    mimeType: string;
  }): Promise<SafeUserDTO> {
    if (!input.fileBuffer || input.fileBuffer.byteLength === 0) {
      throw new ValidationError("Tệp ảnh đại diện không được để trống.");
    }
    if (input.fileBuffer.byteLength > MAX_AVATAR_BYTES) {
      throw new ValidationError("Ảnh đại diện sau khi nén không được vượt quá 2MB.");
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng.");

    const { avatarUrl, avatarPublicId } =
      await this.avatarStorage.uploadUserAvatar({
        userId: user.id,
        fileBuffer: input.fileBuffer,
        mimeType: input.mimeType,
        previousPublicId: user.avatarPublicId,
      });

    const updated = await this.userRepo.updateAvatar(
      user.id,
      avatarUrl,
      avatarPublicId,
    );
    return toSafeUserDTO(updated);
  }
}

export class RemoveAvatarUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly avatarStorage: IAvatarStorageService,
  ) {}

  async execute(userId: string): Promise<SafeUserDTO> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng.");

    if (user.avatarPublicId) {
      await this.avatarStorage.deleteUserAvatar(user.avatarPublicId);
    }

    const updated = await this.userRepo.updateAvatar(user.id, null, null);
    return toSafeUserDTO(updated);
  }
}
