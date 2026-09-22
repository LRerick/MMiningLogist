// ==========================================
// CONFIGURACIÓN Y CONSTANTES
// ==========================================
const CSV_URL = "carga_supabase.csv"; 
const DB_KEY_INVENTARIO = "logistock_inventario_v2";
const DB_KEY_HISTORIAL = "logistock_historial_v2";

// ESTADO EN MEMORIA
let inventario = JSON.parse(localStorage.getItem(DB_KEY_INVENTARIO)) || [];
let historial = JSON.parse(localStorage.getItem(DB_KEY_HISTORIAL)) || [];

// REFERENCIAS DEL DOM
const tablaCuerpo = document.getElementById("cuerpo-tabla");
const cuerpoHistorial = document.getElementById("cuerpo-historial");
const filtroEquipo = document.getElementById("filtro-equipo");
const inputBusqueda = document.getElementById("input-busqueda");
const inputCSV = document.getElementById("input-csv");
const btnExportarCSV = document.getElementById("btn-exportar-csv");
const btnExportarHistorial = document.getElementById("btn-exportar-historial");

const dashTotal = document.getElementById("dash-total-items");
const dashCritico = document.getElementById("dash-stock-critico");
const dashSalidas = document.getElementById("dash-total-salidas");
const dashEntradas = document.getElementById("dash-total-entradas");

const formSalida = document.getElementById("form-salida");
const formEntrada = document.getElementById("form-entrada");
const btnAgregarFila = document.getElementById("btn-agregar-item");
const inputBusquedaVale = document.getElementById("add-item-busqueda");
const valeItemsBody = document.getElementById("vale-salida-items-body");

// Elementos de navegación responsiva
const btnToggleMenu = document.getElementById("btn-toggle-menu");
const btnCloseMenu = document.getElementById("btn-close-menu");
const sidebar = document.getElementById("app-sidebar");
const overlay = document.getElementById("sidebar-overlay");
const navItems = document.querySelectorAll(".nav-item");

// ==========================================
// 1. CARGA AUTOMÁTICA DEL ARCHIVO CSV
// ==========================================
async function cargarCSVAutomatico() {
    if (inventario.length > 0) {
        renderizarInventario();
        return;
    }

    if (tablaCuerpo) {
        tablaCuerpo.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:20px;">Cargando inventario automáticamente desde GitHub...</td></tr>`;
    }

    try {
        const respuesta = await fetch(CSV_URL);
        if (!respuesta.ok) {
            throw new Error(`No se pudo cargar el archivo ${CSV_URL} (Error ${respuesta.status})`);
        }

        const textoCSV = await respuesta.text();
        const lineas = textoCSV.split(/\r?\n/).filter(l => l.trim() !== "");
        
        if (lineas.length < 2) {
            throw new Error("El archivo CSV no contiene filas de datos.");
        }

        const sep = lineas[0].includes(";") ? ";" : ",";
        const cabeceras = lineas[0].split(sep).map(c => c.trim().toLowerCase().replace(/"/g, ""));

        const parseados = [];
        for (let i = 1; i < lineas.length; i++) {
            const fila = lineas[i].split(sep).map(val => val.trim().replace(/"/g, ""));
            if (fila.length < cabeceras.length) continue;

            let itemObj = {};
            cabeceras.forEach((col, idx) => {
                itemObj[col] = fila[idx] || "";
            });

            itemObj.stock = parseFloat(itemObj.stock) || 0;
            parseados.push(itemObj);
        }

        inventario = parseados;
        localStorage.setItem(DB_KEY_INVENTARIO, JSON.stringify(inventario));
        renderizarInventario();

    } catch (err) {
        console.error("Error al cargar CSV:", err);
        if (tablaCuerpo) {
            tablaCuerpo.innerHTML = `<tr><td colspan="11" style="color:red; text-align:center; padding:20px;">Error al cargar automáticamente: ${err.message}. Verifica que '${CSV_URL}' esté en la raíz del repositorio.</td></tr>`;
        }
    }
}

window.recargarCSVOriginal = async function() {
    if (confirm("¿Deseas restablecer el inventario original desde GitHub? Los movimientos en el historial se conservarán.")) {
        localStorage.removeItem(DB_KEY_INVENTARIO);
        inventario = [];
        await cargarCSVAutomatico();
        alert("¡Inventario restablecido con éxito desde el CSV original!");
    }
};

// ==========================================
// 2. INVENTARIO (RENDERIZADO Y EDICIÓN)
// ==========================================
function renderizarInventario() {
    actualizarEquiposEnFiltro();
    actualizarDashboard();

    if (!tablaCuerpo) return;

    let items = [...inventario];
    const equipoSel = filtroEquipo ? filtroEquipo.value : "TODOS";
    const busqueda = inputBusqueda ? inputBusqueda.value.trim().toLowerCase() : "";

    if (equipoSel !== "TODOS") {
        items = items.filter(r => (r.equipo || "").toUpperCase() === equipoSel.toUpperCase());
    }

    if (busqueda !== "") {
        items = items.filter(r => 
            (r.descripcion || "").toLowerCase().includes(busqueda) ||
            (r.nro_parte || "").toLowerCase().includes(busqueda) ||
            (r.cod_comercial || "").toLowerCase().includes(busqueda) ||
            (r.marca || "").toLowerCase().includes(busqueda) ||
            (r.ubicacion || "").toLowerCase().includes(busqueda) ||
            (r.observacion || "").toLowerCase().includes(busqueda)
        );
    }

    if (items.length === 0) {
        tablaCuerpo.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#64748b; padding:15px;">No se encontraron repuestos con los filtros indicados.</td></tr>`;
        return;
    }

    tablaCuerpo.innerHTML = items.map((r, idx) => {
        const stk = parseFloat(r.stock) || 0;
        const tagClass = stk <= 2 ? "warning" : "ok";
        return `
            <tr>
                <td><strong>${r.marca || "-"}</strong></td>
                <td>${r.equipo || "-"}</td>
                <td>${r.item || "-"}</td>
                <td>${r.descripcion || "-"}</td>
                <td><code>${r.nro_parte || "-"}</code></td>
                <td><code>${r.cod_comercial || "-"}</code></td>
                <td>${r.unidad || "UND"}</td>
                <td>
                    <input type="number" class="cell-input" value="${stk}" min="0" style="width: 70px;" onchange="guardarCambioFila(${idx}, 'stock', this.value)">
                </td>
                <td>
                    <input type="text" class="cell-input" value="${r.ubicacion || ''}" placeholder="Ej: A-1" onchange="guardarCambioFila(${idx}, 'ubicacion', this.value)">
                </td>
                <td>
                    <input type="text" class="cell-input" value="${r.observacion || ''}" placeholder="Agregar nota..." onchange="guardarCambioFila(${idx}, 'observacion', this.value)">
                </td>
                <td>
                    <span class="tag ${tagClass}">${stk <= 2 ? 'Crítico' : 'OK'}</span>
                </td>
            </tr>
        `;
    }).join("");
}

window.guardarCambioFila = function(index, campo, valor) {
    if (inventario[index]) {
        inventario[index][campo] = campo === 'stock' ? (parseFloat(valor) || 0) : valor;
        localStorage.setItem(DB_KEY_INVENTARIO, JSON.stringify(inventario));
        actualizarDashboard();
    }
};

function actualizarEquiposEnFiltro() {
    if (!filtroEquipo) return;
    const equiposUnicos = [...new Set(inventario.map(i => (i.equipo || "").trim()).filter(Boolean))];
    const valorPrevio = filtroEquipo.value;

    filtroEquipo.innerHTML = `<option value="TODOS">-- Todos los Equipos --</option>` + 
        equiposUnicos.map(eq => `<option value="${eq}">${eq}</option>`).join("");
    
    if (equiposUnicos.includes(valorPrevio)) {
        filtroEquipo.value = valorPrevio;
    }
}

// ==========================================
// 3. DASHBOARD Y REGISTRO DE MOVIMIENTOS
// ==========================================
function actualizarDashboard() {
    if (dashTotal) dashTotal.textContent = inventario.length;
    if (dashCritico) {
        const criticos = inventario.filter(i => (parseFloat(i.stock) || 0) <= 2).length;
        dashCritico.textContent = criticos;
    }
    if (dashSalidas) {
        dashSalidas.textContent = historial.filter(h => h.tipo === "SALIDA").length;
    }
    if (dashEntradas) {
        dashEntradas.textContent = historial.filter(h => h.tipo === "ENTRADA").length;
    }

    if (cuerpoHistorial) {
        if (historial.length === 0) {
            cuerpoHistorial.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#64748b; padding:15px;">No se registran movimientos aún.</td></tr>`;
            return;
        }

        cuerpoHistorial.innerHTML = historial.slice().reverse().map(h => `
            <tr>
                <td>${h.fecha}</td>
                <td><span class="tag ${h.tipo === 'ENTRADA' ? 'ok' : 'warning'}">${h.tipo}</span></td>
                <td><strong>${h.nro_vale}</strong></td>
                <td><code>${h.motivo || "-"}</code></td>
                <td><code>${h.nro_parte}</code></td>
                <td>${h.descripcion}</td>
                <td><strong>${h.cantidad}</strong></td>
                <td>${h.responsable}</td>
                <td>${h.destino_origen}</td>
            </tr>
        `).join("");
    }
}

// ==========================================
// 4. IMPORTACIÓN Y EXPORTACIÓN DE ARCHIVOS
// ==========================================
if (inputCSV) {
    inputCSV.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            const lineas = evt.target.result.split(/\r?\n/).filter(l => l.trim() !== "");
            if (lineas.length < 2) return alert("El archivo CSV no contiene filas de datos.");

            const sep = lineas[0].includes(";") ? ";" : ",";
            const cabeceras = lineas[0].split(sep).map(c => c.trim().toLowerCase().replace(/"/g, ""));

            const parseados = [];
            for (let i = 1; i < lineas.length; i++) {
                const fila = lineas[i].split(sep).map(val => val.trim().replace(/"/g, ""));
                if (fila.length < cabeceras.length) continue;

                let itemObj = {};
                cabeceras.forEach((col, idx) => {
                    itemObj[col] = fila[idx] || "";
                });

                itemObj.stock = parseFloat(itemObj.stock) || 0;
                parseados.push(itemObj);
            }

            if (parseados.length > 0) {
                inventario = parseados;
                localStorage.setItem(DB_KEY_INVENTARIO, JSON.stringify(inventario));
                alert(`¡Se importaron ${parseados.length} repuestos correctamente!`);
                renderizarInventario();
            }
        };
        reader.readAsText(file);
    });
}

if (btnExportarCSV) {
    btnExportarCSV.addEventListener("click", () => {
        if (inventario.length === 0) return alert("No hay datos en el inventario para exportar.");

        const cabeceras = ["marca", "equipo", "item", "descripcion", "nro_parte", "cod_comercial", "observacion", "unidad", "stock", "ubicacion"];
        const lineas = [cabeceras.join(",")];

        inventario.forEach(r => {
            const fila = cabeceras.map(col => `"${(r[col] ?? "").toString().replace(/"/g, '""')}"`);
            lineas.push(fila.join(","));
        });

        const blob = new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Inventario_Huachipa_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
    });
}

if (btnExportarHistorial) {
    btnExportarHistorial.addEventListener("click", () => {
        if (historial.length === 0) return alert("No hay movimientos registrados para exportar.");

        const cabeceras = ["fecha", "tipo", "nro_vale", "motivo", "nro_parte", "descripcion", "cantidad", "responsable", "destino_origen"];
        const lineas = [cabeceras.join(",")];

        historial.forEach(h => {
            const fila = cabeceras.map(col => `"${(h[col] ?? "").toString().replace(/"/g, '""')}"`);
            lineas.push(fila.join(","));
        });

        const blob = new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Historial_Movimientos_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
    });
}

// ==========================================
// 5. VALE DE SALIDA (AÑADIR, QUITAR Y GUARDAR)
// ==========================================
window.eliminarFilaVale = function(btn) {
    const fila = btn.closest("tr");
    const tbody = document.getElementById("vale-salida-items-body");
    
    if (tbody.querySelectorAll("tr").length <= 1) {
        if (confirm("¿Deseas vaciar los datos de este repuesto?")) {
            fila.querySelector(".part-input").value = "";
            fila.querySelector(".desc-input").value = "";
            fila.querySelector(".unid-input").value = "UND";
            fila.querySelector(".cant-input").value = "1";
            fila.querySelector(".equip-input").value = "";
        }
        return;
    }

    fila.remove();
};

if (btnAgregarFila) {
    btnAgregarFila.addEventListener("click", () => {
        const term = inputBusquedaVale.value.trim().toLowerCase();
        if (!term) return alert("Escribe un código o N° de parte para buscar.");

        const match = inventario.find(i => 
            (i.nro_parte || "").toLowerCase().includes(term) ||
            (i.cod_comercial || "").toLowerCase().includes(term)
        );

        if (!match) return alert("Repuesto no encontrado en el inventario.");

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><input type="text" class="input-cell part-input" value="${match.nro_parte || match.cod_comercial}" required></td>
            <td><input type="text" class="input-cell desc-input" value="${match.descripcion}" required></td>
            <td><input type="text" class="input-cell unid-input" value="${match.unidad || 'UND'}"></td>
            <td><input type="number" class="input-cell cant-input" value="1" min="1" max="${match.stock}" required></td>
            <td><input type="text" class="input-cell equip-input" value="${match.equipo || ''}"></td>
            <td class="no-print">
                <button type="button" class="btn-remove-row" onclick="eliminarFilaVale(this)" title="Quitar este repuesto">✕</button>
            </td>
        `;
        valeItemsBody.appendChild(tr);
        inputBusquedaVale.value = "";
    });
}

if (formSalida) {
    formSalida.addEventListener("submit", (e) => {
        e.preventDefault();
        const nroVale = document.getElementById("sal-nro").value;
        const fecha = document.getElementById("sal-fecha").value;
        const motivoSalida = document.querySelector('input[name="motivo_salida"]:checked')?.value || "REPARACION DEL TALLER";
        const solicita = document.getElementById("sal-solicita").value;
        const destino = document.getElementById("sal-destino").value;
        const filas = valeItemsBody.querySelectorAll("tr");

        if (filas.length === 0) return alert("El vale no contiene ningún repuesto.");

        for (const fila of filas) {
            const parte = fila.querySelector(".part-input").value.trim();
            const desc = fila.querySelector(".desc-input").value.trim();
            const cant = parseFloat(fila.querySelector(".cant-input").value) || 0;

            const rep = inventario.find(i => 
                (i.nro_parte || "").toLowerCase() === parte.toLowerCase() ||
                (i.cod_comercial || "").toLowerCase() === parte.toLowerCase()
            );

            if (rep) {
                rep.stock = Math.max(0, (parseFloat(rep.stock) || 0) - cant);
            }

            historial.push({
                fecha: fecha,
                tipo: "SALIDA",
                nro_vale: nroVale,
                motivo: motivoSalida,
                nro_parte: parte,
                descripcion: desc,
                cantidad: cant,
                responsable: solicita,
                destino_origen: destino
            });
        }

        localStorage.setItem(DB_KEY_INVENTARIO, JSON.stringify(inventario));
        localStorage.setItem(DB_KEY_HISTORIAL, JSON.stringify(historial));

        alert(`¡Vale de Salida Nº ${nroVale} registrado con éxito! Stock actualizado.`);
        renderizarInventario();
    });
}

// ==========================================
// 6. VALE DE ENTRADA
// ==========================================
if (formEntrada) {
    formEntrada.addEventListener("submit", (e) => {
        e.preventDefault();
        const nroVale = document.getElementById("ent-nro").value;
        const fecha = document.getElementById("ent-fecha").value;
        const motivoIngreso = document.querySelector('input[name="motivo_ingreso"]:checked')?.value || "DEVOLUCION";
        const prov = document.getElementById("ent-prov").value;
        const oc = document.getElementById("ent-oc").value;
        const parte = document.getElementById("ent-item").value.trim();
        const cant = parseFloat(document.getElementById("ent-cant").value) || 0;
        const ubicacionNueva = document.getElementById("ent-ubicacion").value.trim();

        const rep = inventario.find(i => 
            (i.nro_parte || "").toLowerCase() === parte.toLowerCase() ||
            (i.cod_comercial || "").toLowerCase() === parte.toLowerCase()
        );

        if (!rep) {
            alert("El N° de parte no existe en el inventario maestro.");
            return;
        }

        rep.stock = (parseFloat(rep.stock) || 0) + cant;
        if (ubicacionNueva !== "") rep.ubicacion = ubicacionNueva;

        historial.push({
            fecha: fecha,
            tipo: "ENTRADA",
            nro_vale: nroVale,
            motivo: motivoIngreso,
            nro_parte: parte,
            descripcion: rep.descripcion,
            cantidad: cant,
            responsable: prov,
            destino_origen: oc || "Almacén Huachipa"
        });

        localStorage.setItem(DB_KEY_INVENTARIO, JSON.stringify(inventario));
        localStorage.setItem(DB_KEY_HISTORIAL, JSON.stringify(historial));

        alert(`¡Vale de Entrada Nº ${nroVale} registrado! Stock incrementado.`);
        formEntrada.reset();
        renderizarInventario();
    });
}

// ==========================================
// 7. FIRMAS DIGITALES EN CANVAS
// ==========================================
function inicializarCanvasFirma(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let dibujando = false;

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function empezar(e) {
        dibujando = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        e.preventDefault();
    }

    function trazar(e) {
        if (!dibujando) return;
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        e.preventDefault();
    }

    function parar() { dibujando = false; }

    canvas.addEventListener("mousedown", empezar);
    canvas.addEventListener("mousemove", trazar);
    window.addEventListener("mouseup", parar);

    canvas.addEventListener("touchstart", empezar, { passive: false });
    canvas.addEventListener("touchmove", trazar, { passive: false });
    window.addEventListener("touchend", parar);
}

window.limpiarFirma = function(id) {
    const canvas = document.getElementById(id);
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
};

// ==========================================
// 8. CONTROL DEL MENÚ RESPONSIVO (MÓVIL)
// ==========================================
function abrirMenu() {
    if (sidebar && overlay) {
        sidebar.classList.add("active");
        overlay.classList.add("active");
    }
}

function cerrarMenu() {
    if (sidebar && overlay) {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
    }
}

if (btnToggleMenu) btnToggleMenu.addEventListener("click", abrirMenu);
if (btnCloseMenu) btnCloseMenu.addEventListener("click", cerrarMenu);
if (overlay) overlay.addEventListener("click", cerrarMenu);

navItems.forEach(item => {
    item.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
            cerrarMenu();
        }
    });
});

// ==========================================
// 9. INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const salFecha = document.getElementById("sal-fecha");
    if (salFecha) salFecha.valueAsDate = new Date();

    const entFecha = document.getElementById("ent-fecha");
    if (entFecha) entFecha.valueAsDate = new Date();

    if (filtroEquipo) filtroEquipo.addEventListener("change", renderizarInventario);
    if (inputBusqueda) inputBusqueda.addEventListener("input", renderizarInventario);

    inicializarCanvasFirma("canvas-autorizado");
    inicializarCanvasFirma("canvas-almacen");

    cargarCSVAutomatico();
});
