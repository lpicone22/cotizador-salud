const express = require("express");
const path = require("path");
const xlsx = require("xlsx");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

const app = express();
const PORT = 3000;

// Middleware para procesar JSON en las solicitudes POST
app.use(express.json());

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// Ruta para servir "index.html"
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Cargar los datos del archivo Excel (Lista de Precios)
const workbook = xlsx.readFile("cotizador.xlsx");
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const precios = xlsx.utils.sheet_to_json(sheet);

// Ruta para manejar la cotización
app.post("/cotizar", (req, res) => {
    try {
        const { edades, cantidadHijos, aportes } = req.body;

        if (!edades || cantidadHijos === undefined) {
            return res.status(400).json({ error: "Faltan datos para la cotización" });
        }

        let resultados = [];

        precios.forEach(plan => {
            let totalPrecio = 0;

            // Calcular precios por edad
            edades.forEach(edad => {
                if (edad >= 18 && edad <= 25) totalPrecio += plan["18-25"];
                else if (edad >= 26 && edad <= 35) totalPrecio += plan["26-35"];
                else if (edad >= 36 && edad <= 54) totalPrecio += plan["36-54"];
                else if (edad >= 55 && edad <= 59) totalPrecio += plan["55-59"];
                else if (edad >= 60) totalPrecio += plan["60"];
            });

            // Calcular costos de hijos
            let costoHijo1 = cantidadHijos > 0 ? plan["HIJO 1"] : 0;
            let costoHijos2 = cantidadHijos > 1 ? plan["HIJO 2 o +"] * (cantidadHijos - 1) : 0;
            let costoTotalHijos = costoHijo1 + costoHijos2;

            let valorCuota = Math.round(totalPrecio + costoTotalHijos);
            let descuento = Math.round(valorCuota * 0.3);
            let cuotaConDescuento = Math.round(valorCuota - descuento);
            let aportesDescontar = Math.round((aportes / 0.03) * 0.075);
            let cuotaFinal = Math.round(cuotaConDescuento - aportesDescontar);
            let iva = aportes > 0 ? 0 : Math.round(cuotaFinal * 0.105);
            let totalPagar = Math.max(0, cuotaFinal + iva);

            resultados.push({
                plan: plan["PLAN"],
                valorCuota: valorCuota,
                descuentoAplicado: descuento,
                cuotaConDescuento: cuotaConDescuento,
                aportesEstimados: aportesDescontar,
                cuotaFinalConAportes: cuotaFinal,
                ivaAplicado: iva,
                totalPagar: totalPagar
            });
        });

        res.json(resultados);
    } catch (error) {
        console.error("Error en /cotizar:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// Ruta para generar el PDF con los datos seleccionados
app.post("/generar-pdf", async (req, res) => {
    try {
        const { planesSeleccionados, nombre, edades, cantidadHijos } = req.body;

        if (!planesSeleccionados || planesSeleccionados.length === 0) {
            return res.status(400).json({ error: "No se han seleccionado planes" });
        }

        // Cargar el PDF desde local (debes haberlo guardado en la carpeta del proyecto)
        const pdfPath = path.join(__dirname, "presupuesto_base.pdf");
        const existingPdfBytes = fs.readFileSync(pdfPath);

        // Cargar el PDF y editarlo
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();

        // Obtener la fecha actual
        const fecha = new Date();
        const dia = fecha.getDate().toString();
        const mes = (fecha.getMonth() + 1).toString();
        const anio = fecha.getFullYear().toString();

        // Llenar los campos del PDF
        if (nombre) form.getTextField("Nombre y Apellido").setText(nombre);
        form.getTextField("dia").setText(dia);
        form.getTextField("mes").setText(mes);
        form.getTextField("año").setText(anio);
        form.getTextField("Edades").setText(edades.join(", "));
        form.getTextField("Cantidad de Hijos").setText(cantidadHijos.toString());

        // Llenar los planes seleccionados en el PDF
        planesSeleccionados.forEach((plan, index) => {
            if (index < 3) {
                form.getTextField(`Plan ${index + 1}`).setText(plan);
                form.getTextField(`IVA Plan ${index + 1}`).setText("0"); // Modificar si aplica IVA
                form.getTextField(`Descuento Plan ${index + 1}`).setText("0"); // Modificar si aplica descuento
                form.getTextField(`Total Plan ${index + 1}`).setText("0"); // Modificar si aplica total
            }
        });

        // Guardar el PDF editado
        const pdfBytes = await pdfDoc.save();
        res.setHeader("Content-Disposition", "attachment; filename=Presupuesto_Salud.pdf");
        res.setHeader("Content-Type", "application/pdf");
        res.send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error("Error en /generar-pdf:", error);
        res.status(500).json({ error: "Error al generar el PDF" });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
