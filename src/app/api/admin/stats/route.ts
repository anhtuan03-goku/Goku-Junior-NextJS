import { NextResponse } from "next/server";
import { getContainer } from "@/infrastructure/container";
import {
  handleApiError,
  requireAdminUser,
} from "@/interfaces/http/api-helpers";

export async function GET() {
  try {
    const admin = await requireAdminUser();
    const stats = await getContainer().useCases.adminGetStats.execute(admin);
    return NextResponse.json({ stats }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
