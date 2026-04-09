import { NextResponse } from "next/server";
import { z } from "zod";
import {
  OpenAIConfigError,
  OpenAIResponseError,
  generateHomepageAssistantReply,
} from "@/packages/homepage-assistant/src";

export const runtime = "nodejs";

const chatRequestSchema = z.object({
  attachments: z
    .array(
      z.object({
        mimeType: z.string().trim().max(200),
        name: z.string().trim().min(1).max(260),
        size: z.number().int().nonnegative().max(250 * 1024 * 1024),
      }),
    )
    .max(50)
    .default([]),
  message: z.string().trim().max(4000).default(""),
}).superRefine((payload, context) => {
  if (!payload.message.trim() && payload.attachments.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please enter a message or attach a file before sending.",
      path: ["message"],
    });
  }
});

export async function POST(request: Request) {
  try {
    const payload = chatRequestSchema.parse(await request.json());
    const output = await generateHomepageAssistantReply(payload.message, payload.attachments);

    return NextResponse.json({ output });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Please enter a message before sending." },
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
