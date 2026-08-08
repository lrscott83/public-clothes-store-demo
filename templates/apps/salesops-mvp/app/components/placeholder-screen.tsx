interface PlaceholderScreenProps {
  heading: string;
  description: string;
}

/**
 * Shared stub body for every screen route that hasn't been implemented yet
 * (Tasks 3-9 replace each one). Deduped here (design.md Phase 3 REFACTOR)
 * instead of repeating the same heading/description markup 7 times.
 */
export function PlaceholderScreen({ heading, description }: PlaceholderScreenProps) {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">{heading}</h1>
      <p className="mt-2 text-sm text-text-muted">{description}</p>
    </main>
  );
}
