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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { readApiError, type ApiError } from "@/lib/api-error";
import { dropCachedOrder } from "@/lib/order-cache";
import { deleteOrderRequestSchema } from "@/lib/schemas/order";
import type { SerialisedOrder } from "./types";

export function DeleteOrderDialog({ order }: { order: SerialisedOrder }) {
  const router = useRouter();
  const locked = (order.payments ?? []).length > 0;
  const [open, setOpen] = useState(false);
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(deleteOrderRequestSchema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: { password: string }) {
    setApiError(null);

    const response = await fetch(`/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setApiError(await readApiError(response));
      return;
    }

    dropCachedOrder(order.id);
    toast.success("Order deleted.");
    router.push("/dashboard");
    router.refresh();
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setApiError(null);
      reset({ password: "" });
    }
  }

  if (locked) {
    return (
      <Button
        variant="destructive"
        size="sm"
        disabled
        title="Orders with recorded payments cannot be deleted."
      >
        Delete
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this order?</DialogTitle>
          <DialogDescription>
            This cannot be undone. Confirm your password to delete the order.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <Controller
              control={control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="delete-password">Password</FieldLabel>
                  <Input
                    id="delete-password"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            {apiError && (
              <Alert variant="destructive">
                <AlertTitle>{apiError.message}</AlertTitle>
              </Alert>
            )}

            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? "Deleting..." : "Delete order"}
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}
