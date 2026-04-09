import { NextResponse } from "next/server";
import {
  deletePendingChatAttachment,
  getChatAttachmentContent,
} from "@/packages/chat-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
  withChatActorCookie,
} from "../../route-helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    attachmentId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { attachmentId } = await context.params;

  try {
    const { attachment, buffer } = await getChatAttachmentContent({
      attachmentId,
      ownerId,
    });
    const url = new URL(request.url);
    const shouldDownload = url.searchParams.get("download") === "1";
    const response = new NextResponse(new Uint8Array(buffer), {
      headers: {
        "cache-control": "private, max-age=300",
        "content-disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${attachment.originalName}"`,
        "content-length": String(buffer.byteLength),
        "content-type": attachment.mimeType,
        "x-content-type-options": "nosniff",
      },
      status: 200,
    });

    return withChatActorCookie(response, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Attachment could not be opened right now.",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { attachmentId } = await context.params;

  try {
    await deletePendingChatAttachment({
      attachmentId,
      ownerId,
    });

    return jsonChatResponse({ ok: true }, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Attachment could not be removed right now.",
    });
  }
}
