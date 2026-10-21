export default function WorkspaceLoading() {
  return (
    <div className="flex flex-1 items-center justify-center" aria-busy="true" aria-label="Loading">
      <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-[var(--color-action-primary)]" />
    </div>
  );
}
