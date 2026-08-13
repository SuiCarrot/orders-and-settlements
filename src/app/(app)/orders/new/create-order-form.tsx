"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { createOrderSchema, type CreateOrderInput } from "@/lib/schemas/order";
import { currency, todayIsoDate } from "@/lib/format";
import { formatCents, parseMoneyToCents } from "@/server/domain/money";
import { lineTotalCents } from "@/server/domain/totals";
import { readApiError, type ApiError } from "@/lib/api-error";
import { cacheOrder } from "@/lib/order-cache";
import type { SerialisedOrder } from "@/app/(app)/orders/[id]/types";

const EMPTY_ITEM = { description: "", quantity: 1, unitPrice: "" };

export function CreateOrderForm() {
  const router = useRouter();
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      customer: "",
      dueDate: todayIsoDate(),
      items: [EMPTY_ITEM],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");

  // Computed with the same domain functions the server uses, so the preview
  // can never disagree with what gets stored.
  const subtotalCents = items.reduce((sum, item) => {
    try {
      const unitPriceCents = parseMoneyToCents(item.unitPrice || "0");
      return sum + lineTotalCents({ ...item, unitPriceCents });
    } catch {
      return sum;
    }
  }, 0);

  async function onSubmit(values: CreateOrderInput) {
    setApiError(null);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setApiError(await readApiError(response));
      return;
    }

    const { data } = (await response.json()) as { data: SerialisedOrder };
    cacheOrder(data);
    toast.success(`Order for ${values.customer} created.`);
    router.push(`/orders/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <Controller
          control={control}
          name="customer"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor="customer">Customer</FieldLabel>
              <Input id="customer" aria-invalid={!!fieldState.error} {...field} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />

        <Controller
          control={control}
          name="dueDate"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
              <Input id="dueDate" type="date" aria-invalid={!!fieldState.error} {...field} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
      </FieldGroup>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Line items</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(EMPTY_ITEM)}
          >
            <PlusIcon /> Add item
          </Button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2 rounded-xl border p-3">
              <div className="grid flex-1 grid-cols-[1fr_5rem_7rem] gap-2">
                <Controller
                  control={control}
                  name={`items.${index}.description`}
                  render={({ field: f, fieldState }) => (
                    <Field data-invalid={!!fieldState.error}>
                      <FieldLabel htmlFor={`item-${index}-description`}>Description</FieldLabel>
                      <Input id={`item-${index}-description`} aria-invalid={!!fieldState.error} {...f} />
                      {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`items.${index}.quantity`}
                  render={({ field: f, fieldState }) => (
                    <Field data-invalid={!!fieldState.error}>
                      <FieldLabel htmlFor={`item-${index}-quantity`}>Qty</FieldLabel>
                      <Input
                        id={`item-${index}-quantity`}
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
                      <FieldLabel htmlFor={`item-${index}-unitPrice`}>Unit price</FieldLabel>
                      <Input
                        id={`item-${index}-unitPrice`}
                        placeholder="0.00"
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
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
        <span className="text-muted-foreground text-sm">Order total</span>
        <span className="text-lg font-semibold tabular-nums">
          {currency(formatCents(subtotalCents))}
        </span>
      </div>

      {apiError && (
        <Alert variant="destructive">
          <AlertTitle>{apiError.message}</AlertTitle>
        </Alert>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Creating..." : "Create order"}
      </Button>
    </form>
  );
}
