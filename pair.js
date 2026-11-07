import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";

import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

import pn from "awesome-phonenumber";

const router = express.Router();

const logger = pino({ level: "silent" });
const activeSessions = new Map();

const SESSION_DIR = path.resolve("./sessions");

// Create session directory
fs.mkdirSync(SESSION_DIR, { recursive: true });

// ==========================================
// PAIR CODE ROUTE
// ==========================================

router.get("/", async (req, res) => {

    let num = String(req.query.number || "")
        .replace(/[^0-9]/g, "");

    if (!num) {
        return res.status(400).json({
            error: "WhatsApp number is required."
        });
    }

    // Validate number
    const phone = pn("+" + num);

    if (!phone.isValid()) {
        return res.status(400).json({
            error: "Invalid international phone number."
        });
    }

    num = phone.getNumber("e164").replace("+", "");

    // Prevent duplicate pairing requests
    if (activeSessions.has(num)) {
        return res.status(409).json({
            error: "A pairing request is already active for this number."
        });
    }

    const sessionDir = path.join(SESSION_DIR, num);

    let socket;

    try {

        console.log("================================");
        console.log(" DARK DILA-MD PAIR SYSTEM");
        console.log("================================");
        console.log("Starting pairing for:", num);

        // Authentication state
        const { state, saveCreds } =
            await useMultiFileAuthState(sessionDir);

        if (state.creds.registered) {
            return res.status(409).json({
                error: "This number already has a saved WhatsApp session."
            });
        }

        // Baileys version
        const { version } =
            await fetchLatestBaileysVersion();

        console.log(
            "Baileys Version:",
            version.join(".")
        );

        // Create WhatsApp socket
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

            connectTimeoutMs: 60000,

            defaultQueryTimeoutMs: 60000,

            keepAliveIntervalMs: 30000,

            retryRequestDelayMs: 250

        });

        activeSessions.set(num, socket);

        // Save authentication updates
        socket.ev.on("creds.update", saveCreds);

        // Connection events
        socket.ev.on("connection.update", (update) => {

            const { connection, lastDisconnect } = update;

            if (connection === "open") {

                console.log("================================");
                console.log(" WhatsApp Connected Successfully");
                console.log(" Number:", num);
                console.log("================================");

            }

            if (connection === "close") {

                const reason =
                    lastDisconnect?.error?.output?.statusCode;

                console.log(
                    "Connection closed:",
                    reason
                );

                if (activeSessions.get(num) === socket) {
                    activeSessions.delete(num);
                }

            }

        });

        // Wait for socket initialization
        await delay(2000);

        // Check whether request was cancelled
        if (res.headersSent) return;

        // Generate pairing code
        const code = await socket.requestPairingCode(num);

        console.log("Pair code generated successfully.");

        return res.status(200).json({
            code,
            status: "success",
            bot: "DARK DILA-MD"
        });

    } catch (error) {

        console.error(
            "Pairing Error:",
            error.message
        );

        if (socket) {
            activeSessions.delete(num);

            try {
                socket.end(undefined);
            } catch {}
        }

        if (!res.headersSent) {
            return res.status(500).json({
                error: "Failed to generate pairing code. Please try again."
            });
        }

    }

});

export default router;
