import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = body?.password;

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const result = await login(password);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          remaining: result.remaining,
          retryAfterMs: result.retryAfterMs,
        },
        { status: 401 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
