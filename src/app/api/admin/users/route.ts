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
    const search = searchParams.get("search") ?? undefined;

    const users = await getContainer().useCases.adminListUsers.execute(
      admin,
      search,
    );

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
