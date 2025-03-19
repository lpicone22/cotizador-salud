const express = require("express");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx"); // Librería para leer Excel


const cors = require("cors");



const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PDF_PATH = path.join(__dirname, "public", "presupuesto_base_1.pdf");
const workbook = xlsx.readFile("cotizador.xlsx");
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const precios = xlsx.utils.sheet_to_json(sheet);

// **Ruta para cotizar TODOS los planes**
app.post("/cotizar", (req, res) => {
    try {
        const { edades, cantidadHijos, aportes } = req.body;
        if (!edades || cantidadHijos === undefined) {
            return res.status(400).json({ error: "Faltan datos para la cotización" });
        }

        let resultados = [];

        precios.forEach(plan => {
            let totalPrecio = 0;
            edades.forEach(edad => {
                if (edad >= 18 && edad <= 25) totalPrecio += plan["18-25"];
                else if (edad >= 26 && edad <= 35) totalPrecio += plan["26-35"];
                else if (edad >= 36 && edad <= 54) totalPrecio += plan["36-54"];
                else if (edad >= 55 && edad <= 59) totalPrecio += plan["55-59"];
                else if (edad >= 60) totalPrecio += plan["60"];
            });

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
                nombre: plan["PLAN"],
                valorCuota,
                descuento,
                cuotaConDescuento,
                aportesEstimados: aportesDescontar,
                cuotaFinalConAportes: cuotaFinal,
                ivaAplicado: iva,
                totalPagar
            });
        });

        res.json(resultados);
    } catch (error) {
        console.error("Error en /cotizar:", error);
        res.status(500).json({ error: "Error en la cotización" });
    }
});

// Función para formatear los valores numéricos como moneda ($)
const formatoMoneda = (valor) => {
    return valor ? `$${new Intl.NumberFormat("es-AR").format(valor)}` : "$0";
};
const { PDFDocument, StandardFonts } = require("pdf-lib"); // Asegúrate de importar StandardFonts

// **Ruta para generar el PDF con los planes seleccionados**
app.post("/generar-pdf", async (req, res) => {
    try {
        const { nombre, edades, cantidadHijos, planesSeleccionados, detallesPlanes, tipoDocumento, numeroDocumento, cantidadIntegrantes, mail, celular, instagram, observaciones } = req.body;

        if (!planesSeleccionados || planesSeleccionados.length === 0) {
            return res.status(400).json({ error: "Debe seleccionar al menos un plan" });
        }

        const pdfBytes = fs.readFileSync(PDF_PATH);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();
        const fields = form.getFields().map(f => f.getName());
        console.log("Campos encontrados en el PDF:", fields);

        // **Función para asignar valores asegurando que no haya errores con valores vacíos**
        const asignarCampo = (campo, valor, formatoMoneda = false) => {
            if (form.getTextField(campo)) {
                let valorFinal = valor !== undefined && valor !== null ? valor.toString() : "0";

                // **Aplicar formato de moneda**
                if (formatoMoneda && !isNaN(valor)) {
                    valorFinal = `$ ${new Intl.NumberFormat("es-AR").format(valor)}`;
                }

                form.getTextField(campo).setText(valorFinal);
            }
        };

        // **Asignar Datos Generales**
        asignarCampo("Nombre y apellido", nombre);
        asignarCampo("Tipo de documennto", tipoDocumento);
        asignarCampo("Número de documento", numeroDocumento);
        asignarCampo("Cantidad de integrantes", cantidadIntegrantes);
        asignarCampo("Mail de contacto", mail);
        asignarCampo("Celular de contacto", celular);
        asignarCampo("Instagram del asesor", instagram);
        asignarCampo("Observaciones", observaciones);
        asignarCampo("edades", edades ? edades.join(", ") : "");
        asignarCampo("cantidad de hijos", cantidadHijos);

        // **Asignar Aporte Total a Descontar con formato de moneda**
        asignarCampo("Aporte", detallesPlanes[planesSeleccionados[0]]?.aportesEstimados || "0", true);

        // ✅ **Asignar Fecha de Cotización**
        const fecha = new Date();
        asignarCampo("día", fecha.getDate());
        asignarCampo("mes", fecha.getMonth() + 1);
        asignarCampo("año", fecha.getFullYear());

        // ✅ **Manejo de los Planes Seleccionados**
        planesSeleccionados.forEach((plan, index) => {
            if (index < 3) {
                asignarCampo(`Plan ${index + 1}`, plan);
                asignarCampo(`Total Plan ${index + 1}`, detallesPlanes[plan]?.totalPagar || "0", true);
                asignarCampo(`descuento plan ${index + 1}`, detallesPlanes[plan]?.descuento || "0", true);
                asignarCampo(`IVA PLAN ${index + 1}`, detallesPlanes[plan]?.ivaAplicado || "0", true);

                // ✅ **Agregar el Valor Cuota sin descuentos (precio base del plan)**
                asignarCampo(`ValorCuota${index + 1}`, detallesPlanes[plan]?.valorCuota || "0", true);

                // ✅ **Nueva lógica de Copagos: Si el plan termina en "_20", se asigna "Si", de lo contrario "No"**
                const copagoValor = plan.includes("_20") ? "Si" : "No";

                if (index === 0) asignarCampo("Copagos plan1", copagoValor);
                if (index === 1) asignarCampo("Copagos plan2", copagoValor);
                if (index === 2) asignarCampo("Copagos plan3", copagoValor);
            }
        });

        // **Convertir el PDF en no editable (cerrarlo)**
        form.flatten();

        // ✅ **Guardar el PDF generado**
        const pdfBytesFinal = await pdfDoc.save();
        const pdfPathOutput = path.join(__dirname, "public", "presupuesto_final.pdf");
        fs.writeFileSync(pdfPathOutput, pdfBytesFinal);

        res.download(pdfPathOutput, "presupuesto_final.pdf");

    } catch (error) {
        console.error("Error al generar el PDF:", error);
        res.status(500).send("Error al generar el PDF");
    }
});



// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
