import { NextResponse } from "next/server";
import { getContainer } from "@/infrastructure/container";
import {
  handleApiError,
  requireAdminUser,
} from "@/interfaces/http/api-helpers";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get("limit") ?? "100", 10);

    const logs = await getContainer().useCases.adminListLikeLogs.execute(
      admin,
      Number.isFinite(limit) ? limit : 100,
    );

    return NextResponse.json({ logs }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
