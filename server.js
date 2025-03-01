const express = require("express");
const path = require("path");

const app = express();

// ✅ 1. Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// ✅ 2. Servir "index.html" cuando se accede a la raíz "/"
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ 3. Iniciar el servidor en el puerto 3000
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

