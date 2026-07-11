import ProductosCliente from "@/features/productos/ProductosCliente";
import { listarProductos } from "@/features/productos/data";
import { listarMateriasPrimasActivas } from "@/features/inventario/data";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const [productos, materiasPrimas] = await Promise.all([
    listarProductos(),
    listarMateriasPrimasActivas(),
  ]);
  return <ProductosCliente productos={productos} materiasPrimas={materiasPrimas} />;
}
