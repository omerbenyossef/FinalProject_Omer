// A lean, cardless empty-state row — see firstdayandemptystates109.md's
// three rules: no content drops entirely rather than showing zeros/dashes,
// every empty state says when it changes, and at most one gets an action.
// Distinct from EmptyState.jsx (icon + centered card), which is a different,
// heavier treatment used elsewhere in the app.
export default function EmptyLine({ label, sentence, meta, action }) {
  return (
    <div className="empty-line">
      {label && <div className="empty-line-label">{label}</div>}
      <p className="empty-line-sentence" dir="auto">
        {sentence}
      </p>
      {meta && (
        <div className="empty-line-meta" dir="ltr">
          {meta}
        </div>
      )}
      {action}
    </div>
  );
}
