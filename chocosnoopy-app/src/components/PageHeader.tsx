import { type ReactNode } from "react";

interface PageHeaderProps {
  titulo: string;
  subtitulo?: string;
  accion?: ReactNode;
}

export default function PageHeader({ titulo, subtitulo, accion }: PageHeaderProps) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{titulo}</h1>
        {subtitulo && <p className="text-sm text-ink/65">{subtitulo}</p>}
      </div>
      {accion}
    </header>
  );
}
