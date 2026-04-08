import type { ErrorCode } from "./enums";

export type ApiErrorDetails = Record<string, unknown> | string[] | null;

export type ApiErrorShape = {
  error_code: ErrorCode;
  message: string;
  details: ApiErrorDetails;
  correlation_id: string;
};

export class ApiError extends Error {
  readonly errorCode: ErrorCode;
  readonly status: number;
  readonly details: ApiErrorDetails;
  readonly correlationId: string;

  constructor(args: {
    errorCode: ErrorCode;
    status: number;
    message: string;
    details?: ApiErrorDetails;
    correlationId: string;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.errorCode = args.errorCode;
    this.status = args.status;
    this.details = args.details ?? null;
    this.correlationId = args.correlationId;
  }

  toJSON(): ApiErrorShape {
    return {
      error_code: this.errorCode,
      message: this.message,
      details: this.details,
      correlation_id: this.correlationId,
    };
  }
}
