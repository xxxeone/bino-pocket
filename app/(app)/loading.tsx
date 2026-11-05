/** Route-level loading UI: a skeleton that matches the page shells. */
export default function Loading() {
  return (
    <main className="px-5 pt-5 anim-rise" aria-busy>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded skeleton" />
          <div className="h-7 w-40 rounded-lg skeleton" />
        </div>
        <div className="size-10 rounded-full skeleton" />
      </div>
      <div className="h-36 rounded-2xl skeleton mt-5" />
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="h-20 rounded-2xl skeleton" />
        <div className="h-20 rounded-2xl skeleton" />
      </div>
      <div className="h-24 rounded-2xl skeleton mt-3" />
      <div className="h-40 rounded-2xl skeleton mt-6" />
    </main>
  );
}
