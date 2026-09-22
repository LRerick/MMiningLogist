// CONFIGURACIÓN DE SUPABASE (Reemplaza con tus llaves reales)
const SUPABASE_URL = "https://pbcbjwoicroxajbeyzru.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiY2Jqd29pY3JveGFqYmV5enJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODMwMzcsImV4cCI6MjEwNTY1OTAzN30.BSQ1HdfZtARt9vv2kGgAcMHP4RiGSx93zvJ7x5vopQ0";

const _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos del DOM
const tablaCuerpo = document.getElementById("cuerpo-tabla");
const filtroEquipo = document.getElementById("filtro-equipo");
const inputBusqueda = document.getElementById("input-busqueda");
const formSalida = document.getElementById("form-salida");
const formEntrada = document.getElementById("form-entrada");
const btnAgregarFila = document.getElementById("btn-agregar-item");
const inputBusquedaItemVale = document.getElementById("add-item-busqueda");
const valeItemsBody = document.getElementById("vale-salida-items-body");

// 1. CARGAR INVENTARIO
async function cargarInventario() {
    tablaCuerpo.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px;">Consultando base de datos...</td></tr>`;

    let query = supabase.from("inventario").select("*").order("descripcion", { ascending: true });

    if (filtroEquipo.value !== "TODOS") {
        query = query.eq("equipo", filtroEquipo.value);
    }
    if (inputBusqueda.value.trim() !== "") {
        const q = inputBusqueda.value.trim();
        query = query.or(`descripcion.ilike.%${q}%,nro_parte.ilike.%${q}%,cod_comercial.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
        tablaCuerpo.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tablaCuerpo.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">No hay repuestos registrados.</td></tr>`;
        return;
    }

    tablaCuerpo.innerHTML = data.map(r => `
        <tr>
            <td><strong>${r.equipo}</strong></td>
            <td>${r.item || "-"}</td>
            <td>${r.descripcion}</td>
            <td><code>${r.nro_parte || "-"}</code></td>
            <td><code>${r.cod_comercial || "-"}</code></td>
            <td>${r.unidad || "UND"}</td>
            <td><span class="tag ${r.stock <= 2 ? 'warning' : 'ok'}">${r.stock}</span></td>
        </tr>
    `).join("");
}

// 2. BUSCADOR PARA AGREGAR FILAS AL VALE DE SALIDA
btnAgregarFila.addEventListener("click", async () => {
    const term = inputBusquedaItemVale.value.trim();
    if (!term) return alert("Ingresa un código o número de parte para buscar");

    const { data, error } = await supabase
        .from("inventario")
        .select("*")
        .or(`nro_parte.ilike.%${term}%,cod_comercial.ilike.%${term}%`)
        .limit(1);

    if (!data || data.length === 0) {
        alert("Repuesto no encontrado en el inventario.");
        return;
    }

    const item = data[0];
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><input type="text" class="input-cell part-input" value="${item.nro_parte || item.cod_comercial}" data-id="${item.id}" required></td>
        <td><input type="text" class="input-cell desc-input" value="${item.descripcion}" required></td>
        <td><input type="text" class="input-cell unid-input" value="${item.unidad || 'UND'}"></td>
        <td><input type="number" class="input-cell cant-input" value="1" min="1" max="${item.stock}" required></td>
        <td><input type="text" class="input-cell equip-input" value="${item.equipo}"></td>
    `;
    valeItemsBody.appendChild(tr);
    inputBusquedaItemVale.value = "";
});

// 3. REGISTRAR VALE DE SALIDA Y DESCONTAR STOCK
formSalida.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nroVale = document.getElementById("sal-nro").value;
    const fecha = document.getElementById("sal-fecha").value;
    const centroCostos = document.querySelector('input[name="centro_costos"]:checked')?.value || "TALLER";
    const guia = document.getElementById("sal-guia").value;
    const oc = document.getElementById("sal-oc").value;
    const ubicacion = document.querySelector('input[name="ubicacion_repuestos"]:checked')?.value || "ALMACEN";
    const solicita = document.getElementById("sal-solicita").value;
    const destino = document.getElementById("sal-destino").value;
    const especificaciones = document.getElementById("sal-especificaciones").value;

    const filas = valeItemsBody.querySelectorAll("tr");
    if (filas.length === 0) return alert("El vale debe tener al menos un ítem.");

    // A. Guardar cabecera del Vale
    const { data: valeGuardado, error: errVale } = await supabase
        .from("vales_salida")
        .insert([{
            nro_vale: nroVale,
            fecha: fecha,
            centro_costos: centroCostos,
            nro_guia_remision: guia,
            nro_oc: oc,
            ubicacion_repuestos: ubicacion,
            solicita: solicita,
            destino: destino,
            especificaciones_uso: especificaciones
        }])
        .select()
        .single();

    if (errVale) {
        alert("Error al guardar el vale: " + errVale.message);
        return;
    }

    // B. Procesar cada ítem del vale y descontar stock
    for (const fila of filas) {
        const parte = fila.querySelector(".part-input").value.trim();
        const desc = fila.querySelector(".desc-input").value;
        const unid = fila.querySelector(".unid-input").value;
        const cant = parseInt(fila.querySelector(".cant-input").value, 10);
        const equip = fila.querySelector(".equip-input").value;

        // Buscar el ítem en la base para descontar
        const { data: rep } = await supabase
            .from("inventario")
            .select("id, stock")
            .or(`nro_parte.eq.${parte},cod_comercial.eq.${parte}`)
            .limit(1);

        if (rep && rep.length > 0) {
            const itemDb = rep[0];
            // Insertar detalle
            await supabase.from("vales_salida_detalle").insert([{
                vale_id: valeGuardado.id,
                id_repuesto: itemDb.id,
                codigo_parte: parte,
                descripcion: desc,
                unidad: unid,
                cantidad: cant,
                equipo: equip
            }]);

            // Descontar inventario
            await supabase.from("inventario").update({
                stock: Math.max(0, itemDb.stock - cant)
            }).eq("id", itemDb.id);
        }
    }

    alert(`¡Vale Nº ${nroVale} registrado con éxito y stock actualizado!`);
    cargarInventario();
});

// 4. REGISTRAR VALE DE ENTRADA Y AUMENTAR STOCK
formEntrada.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nroVale = document.getElementById("ent-nro").value;
    const fecha = document.getElementById("ent-fecha").value;
    const prov = document.getElementById("ent-prov").value;
    const oc = document.getElementById("ent-oc").value;
    const nroParte = document.getElementById("ent-item").value.trim();
    const cant = parseInt(document.getElementById("ent-cant").value, 10);
    const obs = document.getElementById("ent-obs").value;

    const { data: items } = await supabase
        .from("inventario")
        .select("id, stock")
        .or(`nro_parte.eq.${nroParte},cod_comercial.eq.${nroParte}`)
        .limit(1);

    if (!items || items.length === 0) {
        alert("El N° de parte no existe en el inventario maestro.");
        return;
    }

    const item = items[0];

    await supabase.from("vales_entrada").insert([{
        nro_vale: nroVale,
        fecha: fecha,
        proveedor: prov,
        nro_oc_guia: oc,
        id_repuesto: item.id,
        cantidad: cant,
        observaciones: obs
    }]);

    await supabase.from("inventario").update({
        stock: (item.stock || 0) + cant
    }).eq("id", item.id);

    alert("¡Entrada registrada y stock sumado al inventario!");
    formEntrada.reset();
    cargarInventario();
});

// Asignar fecha actual por defecto en los vales
document.getElementById("sal-fecha").valueAsDate = new Date();
document.getElementById("ent-fecha").valueAsDate = new Date();

filtroEquipo.addEventListener("change", cargarInventario);
inputBusqueda.addEventListener("input", cargarInventario);
document.addEventListener("DOMContentLoaded", cargarInventario);
