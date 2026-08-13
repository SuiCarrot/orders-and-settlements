import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currency } from "@/lib/format";
import type { SerialisedItem } from "./types";

interface LineItemsTableProps {
  items: SerialisedItem[];
  total: string;
  isLocked: boolean;
}

export function LineItemsTable({ items, total, isLocked }: LineItemsTableProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Line items</h2>
        {isLocked && (
          <p className="text-muted-foreground text-sm">
            Line items are locked because a payment has been recorded.
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{currency(item.unitPrice)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency(item.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Order total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {currency(total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
