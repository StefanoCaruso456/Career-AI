import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/packages/contracts/src";

export function successResponse<T>(body: T, correlationId: string, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-correlation-id": correlationId,
    },
  });
}

export function errorResponse(error: unknown, fallbackCorrelationId: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(error.toJSON(), {
      status: error.status,
      headers: {
        "x-correlation-id": error.correlationId,
      },
    });
  }

  if (error instanceof ZodError) {
    const apiError = new ApiError({
      errorCode: "VALIDATION_FAILED",
      status: 422,
      message: "Request validation failed.",
      details: error.flatten(),
      correlationId: fallbackCorrelationId,
    });

    return NextResponse.json(apiError.toJSON(), {
      status: apiError.status,
      headers: {
        "x-correlation-id": apiError.correlationId,
      },
    });
  }

  const apiError = new ApiError({
    errorCode: "INTERNAL_ERROR",
    status: 500,
    message: "An unexpected error occurred.",
    details: null,
    correlationId: fallbackCorrelationId,
  });

  return NextResponse.json(apiError.toJSON(), {
    status: apiError.status,
    headers: {
      "x-correlation-id": apiError.correlationId,
    },
  });
}
