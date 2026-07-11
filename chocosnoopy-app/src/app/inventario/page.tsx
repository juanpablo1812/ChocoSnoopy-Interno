import InventarioCliente from "@/features/inventario/InventarioCliente";
import { listarMateriasPrimas } from "@/features/inventario/data";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const materiasPrimas = await listarMateriasPrimas();
  return <InventarioCliente materiasPrimas={materiasPrimas} />;
}
