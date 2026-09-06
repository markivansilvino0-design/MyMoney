export default function Loading() {
  return (
    <main className="main loading-page" aria-label="Loading">
      <div className="skeleton skeleton-heading" />
      <div className="cards">
        <div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" />
      </div>
      <div className="grid-2"><div className="skeleton skeleton-panel" /><div className="skeleton skeleton-panel" /></div>
      <div className="skeleton skeleton-panel wide" />
    </main>
  );
}
