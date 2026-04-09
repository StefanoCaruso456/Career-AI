import { NextResponse } from "next/server";
import {
  OpenAIConfigError,
  OpenAIResponseError,
  transcribeHomepageAssistantAudio,
} from "@/packages/homepage-assistant/src";

export const runtime = "nodejs";

const maxAudioUploadBytes = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioEntry = formData.get("file");

    if (!(audioEntry instanceof File)) {
      return NextResponse.json(
        { error: "Record a voice note before asking for transcription." },
        { status: 400 },
      );
    }

    if (audioEntry.size === 0) {
      return NextResponse.json(
        { error: "That recording is empty. Try speaking again." },
        { status: 400 },
      );
    }

    if (audioEntry.size > maxAudioUploadBytes) {
      return NextResponse.json(
        { error: "Keep voice notes under 25 MB so they can be transcribed reliably." },
        { status: 413 },
      );
    }

    if (audioEntry.type && !audioEntry.type.startsWith("audio/")) {
      return NextResponse.json(
        { error: "Only audio recordings can be transcribed here." },
        { status: 400 },
      );
    }

    const transcript = await transcribeHomepageAssistantAudio(audioEntry);

    return NextResponse.json({ transcript });
  } catch (error) {
    if (error instanceof OpenAIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof OpenAIResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("OpenAI transcription route failed", error);

    return NextResponse.json(
      { error: "The voice note could not be transcribed right now." },
      { status: 500 },
    );
  }
}
