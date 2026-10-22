import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import { EventEmitter } from "events";

import pairRouter from "./pair.js";
import qrRouter from "./qr.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 8000;

EventEmitter.defaultMaxListeners = 500;

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Static files
app.use(express.static(__dirname));

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "pair.html"));
});

// Pair code routes
app.use("/pair", pairRouter);

// QR code routes
app.use("/qr", qrRouter);

// Health check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        name: "THENUVA X MD Pair Web",
        version: "2.0.0"
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: "error",
        message: "Route not found"
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error("Server error:", err.message);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        status: "error",
        message: "Internal server error"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("╭─────────────────────────────╮");
    console.log("   THENUVA X MD PAIR WEB");
    console.log(`   Port: ${PORT}`);
    console.log("   Status: Server started");
    console.log("╰─────────────────────────────╯");
});

export default app;
