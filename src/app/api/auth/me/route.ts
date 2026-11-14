import { NextResponse } from "next/server";
import {
  getOptionalSafeSessionUser,
  handleApiError,
} from "@/interfaces/http/api-helpers";

export async function GET() {
  try {
    const user = await getOptionalSafeSessionUser();
    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
