"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { currency, todayIsoDate } from "@/lib/format";
import { readApiError, type ApiError } from "@/lib/api-error";
import { refundFormSchema, type CreateRefundInput } from "@/lib/schemas/order";

export function RefundDialog({
  orderId,
  paymentId,
  maxAmount,
}: {
  orderId: string;
  paymentId: string;
  maxAmount: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(refundFormSchema),
    defaultValues: { amount: maxAmount, date: todayIsoDate(), reason: "" },
  });

  async function onSubmit(values: CreateRefundInput) {
    setApiError(null);

    const response = await fetch(`/api/orders/${orderId}/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setApiError(await readApiError(response));
      return;
    }

    setOpen(false);
    toast.success(`Refund of ${currency(values.amount)} recorded.`);
    router.refresh();
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setApiError(null);
      reset({ amount: maxAmount, date: todayIsoDate(), reason: "" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Refund</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a refund</DialogTitle>
          <DialogDescription>
            Up to {currency(maxAmount)} can be refunded against this payment. The payment itself is
            not changed — a compensating entry is added instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FieldGroup>
            <Controller
              control={control}
              name="amount"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="refund-amount">Amount</FieldLabel>
                  <div className="flex gap-2">
                    <Input id="refund-amount" aria-invalid={!!fieldState.error} {...field} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(maxAmount)}
                    >
                      Refund remaining
                    </Button>
                  </div>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="date"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="refund-date">Date</FieldLabel>
                  <Input
                    id="refund-date"
                    type="date"
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="reason"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="refund-reason">Reason</FieldLabel>
                  <Input id="refund-reason" aria-invalid={!!fieldState.error} {...field} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </FieldGroup>

          {apiError?.code === "EXCESS_REFUND" && (
            <Alert variant="destructive">
              <AlertTitle>Refund exceeds the refundable amount</AlertTitle>
              <AlertDescription>
                {apiError.message}
                {apiError.details?.maxAllowedAmount && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => setValue("amount", apiError.details!.maxAllowedAmount!)}
                  >
                    Use {currency(apiError.details.maxAllowedAmount)} instead
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {apiError && apiError.code !== "EXCESS_REFUND" && apiError.code !== "VALIDATION_ERROR" && (
            <Alert variant="destructive">
              <AlertTitle>{apiError.message}</AlertTitle>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Recording..." : "Record refund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
