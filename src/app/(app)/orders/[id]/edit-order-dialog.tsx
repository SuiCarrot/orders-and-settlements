"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
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
import { Alert, AlertTitle } from "@/components/ui/alert";
import { currency } from "@/lib/format";
import { formatCents, parseMoneyToCents } from "@/server/domain/money";
import { lineTotalCents } from "@/server/domain/totals";
import { readApiError, type ApiError } from "@/lib/api-error";
import { cacheOrder } from "@/lib/order-cache";
import { updateOrderRequestSchema } from "@/lib/schemas/order";
import type { SerialisedOrder } from "./types";

const EMPTY_ITEM = { description: "", quantity: 1, unitPrice: "" };

export function EditOrderDialog({ order }: { order: SerialisedOrder }) {
  const locked = (order.payments ?? []).length > 0;
  const [open, setOpen] = useState(false);
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(updateOrderRequestSchema),
    defaultValues: {
      customer: order.customer,
      dueDate: order.dueDate,
      items: order.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      password: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");

  const subtotalCents = (items ?? []).reduce((sum, item) => {
    try {
      const unitPriceCents = parseMoneyToCents(item.unitPrice || "0");
      return sum + lineTotalCents({ ...item, unitPriceCents });
    } catch {
      return sum;
    }
  }, 0);

  async function onSubmit(values: {
    customer?: string;
    dueDate?: string;
    items?: { description: string; quantity: number; unitPrice: string }[];
    password: string;
  }) {
    setApiError(null);

    const payload: Record<string, unknown> = {
      customer: values.customer,
      dueDate: values.dueDate,
      password: values.password,
    };
    if (!locked) payload.items = values.items;

    const response = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setApiError(await readApiError(response));
      return;
    }

    const body = (await response.json()) as { data: SerialisedOrder };
    cacheOrder(body.data);
    setOpen(false);
    toast.success("Order updated.");
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setApiError(null);
      reset({
        customer: order.customer,
        dueDate: order.dueDate,
        items: order.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        password: "",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Edit</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit order</DialogTitle>
          <DialogDescription>
            Confirm your password to save changes.
            {locked ? " Line items are locked because a payment has been recorded." : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FieldGroup>
            <Controller
              control={control}
              name="customer"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="edit-customer">Customer</FieldLabel>
                  <Input id="edit-customer" aria-invalid={!!fieldState.error} {...field} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="dueDate"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="edit-dueDate">Due date</FieldLabel>
                  <Input
                    id="edit-dueDate"
                    type="date"
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </FieldGroup>

          {!locked && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Line items</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(EMPTY_ITEM)}
                >
                  <PlusIcon /> Add item
                </Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-2 rounded-xl border p-3">
                  <div className="grid flex-1 grid-cols-[1fr_5rem_7rem] gap-2">
                    <Controller
                      control={control}
                      name={`items.${index}.description`}
                      render={({ field: f, fieldState }) => (
                        <Field data-invalid={!!fieldState.error}>
                          <FieldLabel htmlFor={`edit-item-${index}-description`}>
                            Description
                          </FieldLabel>
                          <Input
                            id={`edit-item-${index}-description`}
                            aria-invalid={!!fieldState.error}
                            {...f}
                          />
                          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`items.${index}.quantity`}
                      render={({ field: f, fieldState }) => (
                        <Field data-invalid={!!fieldState.error}>
                          <FieldLabel htmlFor={`edit-item-${index}-quantity`}>Qty</FieldLabel>
                          <Input
                            id={`edit-item-${index}-quantity`}
                            type="number"
                            min={1}
                            aria-invalid={!!fieldState.error}
                            {...f}
                            onChange={(e) => f.onChange(e.target.valueAsNumber)}
                          />
                          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`items.${index}.unitPrice`}
                      render={({ field: f, fieldState }) => (
                        <Field data-invalid={!!fieldState.error}>
                          <FieldLabel htmlFor={`edit-item-${index}-unitPrice`}>
                            Unit price
                          </FieldLabel>
                          <Input
                            id={`edit-item-${index}-unitPrice`}
                            aria-invalid={!!fieldState.error}
                            {...f}
                          />
                          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                        </Field>
                      )}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6"
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                    aria-label="Remove item"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
                <span className="text-muted-foreground text-sm">Order total</span>
                <span className="font-semibold tabular-nums">
                  {currency(formatCents(subtotalCents))}
                </span>
              </div>
            </div>
          )}

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel htmlFor="edit-password">Password</FieldLabel>
                <Input
                  id="edit-password"
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
