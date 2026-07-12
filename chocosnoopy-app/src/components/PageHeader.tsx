import { type ReactNode } from "react";
import Image from "next/image";

interface PageHeaderProps {
  titulo: string;
  subtitulo?: string;
  accion?: ReactNode;
  logo?: boolean;
}

export default function PageHeader({ titulo, subtitulo, accion, logo = false }: PageHeaderProps) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {logo && (
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-accent bg-secondary shadow-sm">
            <Image
              src="/images/logo-chocosnoopy.png"
              alt="Logo de ChocoSnoopy"
              fill
              sizes="44px"
              className="object-cover object-[50%_62%]"
              priority
            />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{titulo}</h1>
        {subtitulo && <p className="text-sm text-ink/65">{subtitulo}</p>}
        </div>
      </div>
      {accion}
    </header>
  );
}
