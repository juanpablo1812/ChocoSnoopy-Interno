import VentasCliente from "@/features/ventas/VentasCliente";
import { listarVentas, listarProductosVendibles } from "@/features/ventas/data";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const [ventas, productos] = await Promise.all([
    listarVentas(),
    listarProductosVendibles(),
  ]);
  return <VentasCliente ventas={ventas} productos={productos} />;
}
