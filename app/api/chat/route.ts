import { NextResponse } from "next/server";
import { z } from "zod";
import {
  OpenAIConfigError,
  OpenAIResponseError,
  generateHomepageAssistantReply,
} from "@/packages/homepage-assistant/src";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  try {
    const payload = chatRequestSchema.parse(await request.json());
    const output = await generateHomepageAssistantReply(payload.message);

    return NextResponse.json({ output });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Please enter a message before sending." },
        { status: 400 },
      );
    }

    if (error instanceof OpenAIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof OpenAIResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("OpenAI chat route failed", error);

    return NextResponse.json(
      { error: "The assistant could not generate a reply right now." },
      { status: 500 },
    );
  }
}
