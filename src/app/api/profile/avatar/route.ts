import { NextResponse } from "next/server";
import { ValidationError } from "@/domain/errors/domain-errors";
import { getContainer } from "@/infrastructure/container";
import {
  uploadRateLimiter,
  verifyCsrfOrigin,
} from "@/infrastructure/security/request-guards";
import {
  handleApiError,
  requireSessionUser,
} from "@/interfaces/http/api-helpers";

export async function POST(request: Request) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    uploadRateLimiter.consume(`avatar:${user.id}`);

    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      throw new ValidationError("Please select a valid avatar image file.");
    }

    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      throw new ValidationError("Avatar size must be greater than 0B and at most 2MB.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const updatedUser = await getContainer().useCases.updateAvatar.execute({
      userId: user.id,
      fileBuffer: buffer,
      mimeType: file.type || "image/webp",
    });

    return NextResponse.json({ user: updatedUser }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    verifyCsrfOrigin(request);
    const user = await requireSessionUser();
    uploadRateLimiter.consume(`avatar-del:${user.id}`);

    const updatedUser = await getContainer().useCases.removeAvatar.execute(
      user.id,
    );
    return NextResponse.json({ user: updatedUser }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
