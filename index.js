import express from "express";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import path from "path";
import events from "events";

import pairRouter from "./pair.js";
import qrRouter from "./qr.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;

// Event configuration
events.EventEmitter.defaultMaxListeners = 500;

// Middleware
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "pair.html"));
});

// Pair & QR routes
app.use("/pair", pairRouter);
app.use("/qr", qrRouter);

// Health check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        bot: "DARK DILA-MD",
        message: "Pair Web Server is running"
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send("404 - Page Not Found");
});

// Start Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`
====================================
       DARK DILA-MD PAIR WEB
====================================
 Server : http://localhost:${PORT}
 Status : ONLINE
====================================
    `);
});

export default app;
