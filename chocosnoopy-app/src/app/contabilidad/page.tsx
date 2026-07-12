import ContabilidadCliente from "@/features/contabilidad/ContabilidadCliente";
import { obtenerContabilidad } from "@/features/contabilidad/data";

export const dynamic = "force-dynamic";

export default async function ContabilidadPage({ searchParams }: { searchParams: { periodo?: string; desde?: string; hasta?: string } }) {
  const datos = await obtenerContabilidad(searchParams);
  return <ContabilidadCliente datos={datos} />;
}
