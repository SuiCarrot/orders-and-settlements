"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { cacheOrder } from "@/lib/order-cache";
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
import { paymentFormSchema } from "@/lib/schemas/order";
import type { SerialisedOrder } from "./types";

function defaultPaymentAmount(order: SerialisedOrder) {
  return order.status === "refunded" ? order.orderTotal : order.amountDue;
}

export function RecordPaymentDialog({ order }: { order: SerialisedOrder }) {
  const [open, setOpen] = useState(false);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const fullyPaid = order.status === "paid";

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { amount: defaultPaymentAmount(order), date: todayIsoDate(), note: "" },
  });

  async function onSubmit(values: { amount: string; date: string; note?: string }) {
    setApiError(null);

    const response = await fetch(`/api/orders/${order.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setApiError(await readApiError(response));
      return;
    }

    const body = (await response.json()) as { data: SerialisedOrder };
    cacheOrder(body.data);
    setOpen(false);
    toast.success(`Payment of ${currency(values.amount)} recorded.`);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setApiError(null);
      reset({ amount: defaultPaymentAmount(order), date: todayIsoDate(), note: "" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button disabled={fullyPaid} />}>
        {fullyPaid ? "Fully paid" : "Record payment"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {order.status === "refunded"
              ? `${order.customer} was fully refunded. Recording a new payment reopens the order for ${currency(order.orderTotal)}.`
              : `${order.customer} owes ${currency(order.amountDue)} of ${currency(order.orderTotal)}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FieldGroup>
            <Controller
              control={control}
              name="amount"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="amount">Amount</FieldLabel>
                  <div className="flex gap-2">
                    <Input id="amount" aria-invalid={!!fieldState.error} {...field} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(order.amountDue)}
                    >
                      Pay remaining
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
                  <FieldLabel htmlFor="date">Date</FieldLabel>
                  <Input id="date" type="date" aria-invalid={!!fieldState.error} {...field} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="note"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="note">Note (optional)</FieldLabel>
                  <Input id="note" aria-invalid={!!fieldState.error} {...field} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </FieldGroup>

          {apiError?.code === "OVERPAYMENT" && (
            <Alert variant="destructive">
              <AlertTitle>Payment exceeds the balance due</AlertTitle>
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

          {apiError && apiError.code !== "OVERPAYMENT" && apiError.code !== "VALIDATION_ERROR" && (
            <Alert variant="destructive">
              <AlertTitle>{apiError.message}</AlertTitle>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Recording..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
