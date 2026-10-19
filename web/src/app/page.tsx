import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold sm:text-4xl">Ask your paperwork anything.</h1>
      <p className="max-w-md text-neutral-500">
        Bills, receipts, warranties and policies in one place. Ask a question, get the answer
        with the source highlighted.
      </p>
      <Link
        href="/vault"
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Open your vault
      </Link>
    </main>
  );
}
