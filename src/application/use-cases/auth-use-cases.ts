import type { SafeUserDTO, User } from "@/domain/entities/models";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "@/domain/errors/domain-errors";
import type {
  IPasswordHasher,
  ISessionTokenService,
  IUserRepository,
} from "@/domain/repositories/ports";
import {
  normalizeAndValidateUsername,
  toSafeUserDTO,
  validatePassword,
} from "../dtos/mappers";

// Precomputed bcrypt dummy hash for constant-time comparison when username does not exist
const DUMMY_BCRYPT_HASH =
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oL8s.7xS2";

export class RegisterUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ISessionTokenService,
  ) {}

  async execute(input: {
    username: string;
    password: string;
  }): Promise<{ user: SafeUserDTO; token: string }> {
    const username = normalizeAndValidateUsername(input.username);
    const password = validatePassword(input.password);

    const existing = await this.userRepo.findByUsername(username);
    if (existing) {
      throw new ConflictError(
        "This username is already taken. Please choose another one.",
      );
    }

    const passwordHash = await this.passwordHasher.hash(password);
    // Strictly force USER role on public registration (Zero privilege escalation)
    const created = await this.userRepo.create({
      username,
      passwordHash,
      role: "USER",
    });

    const token = await this.tokenService.sign({
      sub: created.id,
      username: created.username,
      role: created.role,
      sv: created.sessionVersion,
    });

    return { user: toSafeUserDTO(created), token };
  }
}

export class LoginUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ISessionTokenService,
  ) {}

  async execute(input: {
    username: string;
    password: string;
  }): Promise<{ user: SafeUserDTO; token: string }> {
    const username = input.username.trim().toLowerCase();
    if (!username || !input.password) {
      throw new UnauthorizedError("Invalid username or password.");
    }

    const user = await this.userRepo.findByUsername(username);
    if (!user) {
      await this.passwordHasher.verify(input.password, DUMMY_BCRYPT_HASH);
      throw new UnauthorizedError("Invalid username or password.");
    }

    const valid = await this.passwordHasher.verify(
      input.password,
      user.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedError("Invalid username or password.");
    }

    if (!user.isActive) {
      throw new ForbiddenError(
        "Your account is currently locked by an administrator.",
      );
    }

    const token = await this.tokenService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      sv: user.sessionVersion,
    });

    return { user: toSafeUserDTO(user), token };
  }
}

export class GetAuthenticatedUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenService: ISessionTokenService,
  ) {}

  async execute(token: string | undefined | null): Promise<User | null> {
    if (!token) return null;
    const payload = await this.tokenService.verify(token);
    if (!payload) return null;

    const user = await this.userRepo.findById(payload.sub);
    if (!user) return null;
    if (!user.isActive) return null;
    if (user.sessionVersion !== payload.sv) return null;

    return user;
  }
}
