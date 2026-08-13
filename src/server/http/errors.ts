import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthenticatedError } from "@/server/auth/require-user";
import { InvalidPasswordError } from "@/server/auth/confirm-password";
import { OverpaymentError } from "@/server/domain/payment-rules";
import { ExcessRefundError } from "@/server/domain/refund-rules";
import { InvalidMoneyError } from "@/server/domain/money";

export class NotFoundError extends Error {
  constructor(resource = "Resource") {
    super(`${resource} not found.`);
  }
}

export class ConflictError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function body(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json(body("UNAUTHENTICATED", "Authentication required."), { status: 401 });
  }
  if (error instanceof InvalidPasswordError) {
    return NextResponse.json(body(error.code, error.message), { status: 403 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      body("VALIDATION_ERROR", "The request body is invalid.", {
        fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
      { status: 400 },
    );
  }
  if (error instanceof InvalidMoneyError) {
    return NextResponse.json(body("VALIDATION_ERROR", error.message), { status: 400 });
  }
  if (error instanceof OverpaymentError || error instanceof ExcessRefundError) {
    return NextResponse.json(body(error.code, error.message, error.details), { status: 409 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json(body(error.code, error.message, error.details), { status: 409 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json(body("NOT_FOUND", error.message), { status: 404 });
  }

  console.error("Unhandled error", error);
  return NextResponse.json(body("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
}

/** Wraps a route handler so no handler needs its own try/catch. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
