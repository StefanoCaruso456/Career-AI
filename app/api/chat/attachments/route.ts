import { createChatAttachment, getChatAttachmentValidationSummary } from "@/packages/chat-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { actor, ownerId } = await resolveChatRouteContext(request);

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      const summary = getChatAttachmentValidationSummary();

      return jsonChatResponse(
        {
          error: `Choose a file before uploading. You can attach up to ${summary.maxFilesPerMessage} files per message.`,
        },
        actor,
        { status: 400 },
      );
    }

    const attachment = await createChatAttachment({
      file: fileEntry,
      ownerId,
    });

    return jsonChatResponse({ attachment }, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Attachment upload failed.",
    });
  }
}
