import { CreateOrderForm } from "./create-order-form";

export default function NewOrderPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">New order</h1>
        <p className="text-muted-foreground text-sm">
          Add a customer, a due date, and at least one line item.
        </p>
      </div>
      <CreateOrderForm />
    </main>
  );
}
