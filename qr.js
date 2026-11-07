import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";

import {
    makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

import QRCode from "qrcode";

const router = express.Router();

const logger = pino({ level: "silent" });

const SESSION_DIR = path.resolve("./qr_sessions");

fs.mkdirSync(SESSION_DIR, { recursive: true });

const activeSessions = new Map();

// ==========================================
// REMOVE SESSION
// ==========================================

function removeFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, {
                recursive: true,
                force: true
            });
        }
    } catch (error) {
        console.error("Session cleanup error:", error);
    }
}

// ==========================================
// QR ROUTE
// ==========================================

router.get("/", async (req, res) => {

    const sessionId =
        Date.now().toString() +
        Math.random().toString(36).slice(2, 9);

    const dirs = path.join(
        SESSION_DIR,
        `session_${sessionId}`
    );

    let socket;
    let responseSent = false;
    let timeout;

    const sendResponse = (status, data) => {
        if (responseSent || res.headersSent) return;

        responseSent = true;

        clearTimeout(timeout);

        res.status(status).json(data);
    };

    try {

        console.log("================================");
        console.log(" DARK DILA-MD QR SYSTEM");
        console.log("================================");

        const { state, saveCreds } =
            await useMultiFileAuthState(dirs);

        const { version } =
            await fetchLatestBaileysVersion();

        socket = makeWASocket({

            version,

            auth: {
                creds: state.creds,

                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    logger
                )
            },

            logger,

            printQRInTerminal: false,

            browser: Browsers.windows("Chrome"),

            markOnlineOnConnect: false,

            generateHighQualityLinkPreview: false,

            defaultQueryTimeoutMs: 60000,

            connectTimeoutMs: 60000,

            keepAliveIntervalMs: 30000

        });

        activeSessions.set(sessionId, socket);

        socket.ev.on("creds.update", saveCreds);

        // ==================================
        // CONNECTION EVENTS
        // ==================================

        socket.ev.on("connection.update", async update => {

            const {
                connection,
                qr,
                lastDisconnect
            } = update;

            // QR GENERATED
            if (qr && !responseSent) {

                try {

                    const qrDataURL =
                        await QRCode.toDataURL(qr, {
                            errorCorrectionLevel: "M",
                            type: "image/png",
                            margin: 2,
                            width: 300,
                            color: {
                                dark: "#000000",
                                light: "#FFFFFF"
                            }
                        });

                    sendResponse(200, {
                        qr: qrDataURL,

                        message: "QR Code generated successfully",

                        instructions: [
                            "1. Open WhatsApp on your phone",
                            "2. Go to Settings > Linked Devices",
                            "3. Select Link a Device",
                            "4. Scan the QR code"
                        ]
                    });

                    console.log("QR code generated.");

                } catch (error) {

                    console.error("QR generation error:", error);

                    sendResponse(500, {
                        error: "Failed to generate QR code"
                    });

                }

            }

            // CONNECTED
            if (connection === "open") {

                clearTimeout(timeout);

                console.log("WhatsApp QR login connected.");

                // Keep authentication locally.
                // Do not upload credentials to MEGA.

            }

            // CONNECTION CLOSED
            if (connection === "close") {

                clearTimeout(timeout);

                activeSessions.delete(sessionId);

                const reason =
                    lastDisconnect?.error?.output?.statusCode;

                console.log(
                    "QR connection closed:",
                    reason
                );

                if (!responseSent) {
                    sendResponse(503, {
                        error: "WhatsApp connection closed"
                    });
                }

            }

        });

        // ==================================
        // GENERATION TIMEOUT
        // ==================================

        timeout = setTimeout(() => {

            if (!responseSent) {

                sendResponse(408, {
                    error: "QR generation timeout. Please try again."
                });

                activeSessions.delete(sessionId);

                try {
                    socket.end(undefined);
                } catch {}

                removeFile(dirs);

            }

        }, 30000);

        // ==================================
        // CLIENT DISCONNECT
        // ==================================

        res.on("close", () => {

            if (!res.writableEnded) {

                clearTimeout(timeout);

                activeSessions.delete(sessionId);

                try {
                    socket.end(undefined);
                } catch {}

                removeFile(dirs);

            }

        });

    } catch (error) {

        console.error("QR initialization error:", error);

        clearTimeout(timeout);

        activeSessions.delete(sessionId);

        if (socket) {
            try {
                socket.end(undefined);
            } catch {}
        }

        removeFile(dirs);

        sendResponse(503, {
            error: "QR service unavailable"
        });

    }

});

export default router;
