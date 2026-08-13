export interface ApiError {
  code: string;
  message: string;
  details?: {
    maxAllowedAmount?: string;
    orderTotal?: string;
    amountPaid?: string;
    attemptedAmount?: string;
    fields?: { path: string; message: string }[];
    [key: string]: unknown;
  };
}

export interface ApiErrorBody {
  error: ApiError;
}

/** The generic fallback shown when a response isn't the standard error shape at all. */
export const UNKNOWN_API_ERROR: ApiError = {
  code: "UNKNOWN_ERROR",
  message: "Something went wrong. Please try again.",
};

export async function readApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error ?? UNKNOWN_API_ERROR;
  } catch {
    return UNKNOWN_API_ERROR;
  }
}
