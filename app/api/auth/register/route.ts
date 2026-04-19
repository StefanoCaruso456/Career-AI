import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCredentialUser,
  CredentialUserConflictError,
  CredentialUserValidationError,
} from "@/lib/credential-user-store";

const registerInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const input = registerInputSchema.parse(await request.json());
    const user = await createCredentialUser(input);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error:
            "Please provide a valid name, email, and password (minimum 8 characters).",
        },
        { status: 400 },
      );
    }

    if (error instanceof CredentialUserValidationError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 400 },
      );
    }

    if (error instanceof CredentialUserConflictError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 409 },
      );
    }

    console.error("Register route failed.", error);
    return NextResponse.json(
      {
        error: "Unable to create your account right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
