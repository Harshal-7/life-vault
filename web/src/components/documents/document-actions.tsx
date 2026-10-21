"use client";

import { Download, Ellipsis, Loader2, Pencil, Shapes, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteDocument, updateDocument } from "@/lib/data/actions";
import { DOC_TYPES, type DocType, type DocumentDetail } from "@/lib/data/types";
import { DOC_TYPE_META } from "@/lib/doc-meta";
import { runAction } from "@/lib/run-action";

/** The ⋯ menu. The delete dialog can also be opened from outside (the failed-document
 * banner's Delete button) by passing `deleting`/`onDeletingChange`. */
export function DocumentActions({
  doc,
  deleting: deletingProp,
  onDeletingChange,
}: {
  doc: DocumentDetail;
  deleting?: boolean;
  onDeletingChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deletingLocal, setDeletingLocal] = useState(false);
  const deleting = deletingProp ?? deletingLocal;
  const setDeleting = onDeletingChange ?? setDeletingLocal;
  const [title, setTitle] = useState(doc.title);
  const [pending, startTransition] = useTransition();

  const rename = () =>
    startTransition(async () => {
      const clean = title.trim();
      if (!clean) return;
      if (!(await runAction(() => updateDocument(doc.id, { title: clean }), { success: "Renamed" }))) return;
      setRenaming(false);
      router.refresh();
    });

  const changeType = (type: string) =>
    startTransition(async () => {
      const moved = `Moved to ${DOC_TYPE_META[type as DocType].plural}`;
      if (await runAction(() => updateDocument(doc.id, { docType: type as DocType }), { success: moved })) router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const { ok } = await deleteDocument(doc.id);
      if (!ok) {
        toast.error("Couldn't delete. Try again.");
        return;
      }
      toast.success(`Deleted “${doc.title}”`);
      router.replace("/vault/documents");
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9" aria-label="Document actions">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Shapes /> Change type
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={doc.docType} onValueChange={changeType}>
                {DOC_TYPES.map((t) => (
                  <DropdownMenuRadioItem key={t} value={t}>
                    {DOC_TYPE_META[t].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {doc.fileUrl ? (
            <DropdownMenuItem asChild>
              {/* Supabase's ?download= makes the signed link save the file under its name. */}
              <a href={`${doc.fileUrl}${doc.fileUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(doc.originalFilename)}`}>
                <Download /> Download original
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>
              <Download /> Download original
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Rename document</DialogTitle>
              <DialogDescription>A clear name makes it easier to find and ask about.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Name</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !title.trim()}>
                {pending && <Loader2 className="animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The file, its details and its reminders are removed for good. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending && <Loader2 className="animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
