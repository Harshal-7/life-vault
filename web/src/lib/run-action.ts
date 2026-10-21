import { toast } from "sonner";

/**
 * Run a server action from a click and tell the user how it went. Treats both a
 * thrown error (network down, server error) and an `{ ok: false }` result as failure,
 * so no action can fail silently or show "Saved" when it wasn't.
 * Returns true when it worked.
 */
export async function runAction(
  action: () => Promise<{ ok: boolean } | void>,
  { success, error = "Couldn't save that. Try again." }: { success?: string; error?: string } = {},
): Promise<boolean> {
  try {
    const result = await action();
    if (result && !result.ok) throw new Error("failed");
    if (success) toast.success(success);
    return true;
  } catch {
    toast.error(error);
    return false;
  }
}
