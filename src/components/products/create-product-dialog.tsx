"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createProductAction, type ActionState } from "@/app/dashboard/products/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: ActionState = { error: null };

export function CreateProductDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProductAction, INITIAL);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          New product
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Create product</DialogTitle>
            <DialogDescription>
              Keyren assigns a permanent product ID. Renaming the product later never
              changes it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-5">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" name="name" placeholder="Seliware Key" autoFocus required maxLength={200} />
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
