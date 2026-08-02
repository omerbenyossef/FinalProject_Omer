export default function EmptyState({ icon, children, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <p className="empty-state-title">{children}</p>
      {action}
    </div>
  );
}
