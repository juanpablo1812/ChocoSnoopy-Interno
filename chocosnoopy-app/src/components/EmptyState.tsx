interface EmptyStateProps {
  icono: string;
  titulo: string;
  descripcion?: string;
}

export default function EmptyState({ icono, titulo, descripcion }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl2 bg-surface px-6 py-14 text-center shadow-card">
      <span className="material-symbols-outlined text-5xl text-primary-dark">{icono}</span>
      <h3 className="text-base font-semibold">{titulo}</h3>
      {descripcion && <p className="max-w-xs text-sm text-muted">{descripcion}</p>}
    </div>
  );
}
