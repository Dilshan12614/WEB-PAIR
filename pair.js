import express from "express";
import pino from "pino";
import pn from "awesome-phonenumber";
import fs from "fs";
import path from "path";

import {
    makeWASocket,
    useMultiFileAuthState,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason
} from "@whiskeysockets/baileys";

const router = express.Router();

const SESSION_DIR = path.join(process.cwd(), "auth_info_baileys");

const logger = pino({
    level: "silent"
});

let socket = null;
let starting = false;
let connected = false;
let lastRequest = 0;

// Check existing session
function hasExistingSession() {
    const credsPath = path.join(SESSION_DIR, "creds.json");
    return fs.existsSync(credsPath);
}

// Generate Pair Code
router.post("/", async (req, res) => {

    if (starting) {
        return res.status(409).json({
            success: false,
            error: "Pairing is already in progress. Please wait."
        });
    }

    if (connected) {
        return res.status(409).json({
            success: false,
            error: "WhatsApp is already connected."
        });
    }

    if (Date.now() - lastRequest < 30000) {
        return res.status(429).json({
            success: false,
            error: "Please wait 30 seconds before trying again."
        });
    }

    let number = String(req.body.number || "")
        .replace(/[^0-9]/g, "");

    if (!number) {
        return res.status(400).json({
            success: false,
            error: "Please enter your WhatsApp number."
        });
    }

    const phone = pn("+" + number);

    if (!phone.isValid()) {
        return res.status(400).json({
            success: false,
            error: "Invalid WhatsApp phone number."
        });
    }

    number = phone.getNumber("e164").replace("+", "");

    if (hasExistingSession()) {
        return res.status(409).json({
            success: false,
            error: "An existing session was found. Remove it before pairing a different account."
        });
    }

    lastRequest = Date.now();
    starting = true;

    try {

        const { state, saveCreds } =
            await useMultiFileAuthState(SESSION_DIR);

        const { version } =
            await fetchLatestBaileysVersion();

        socket = makeWASocket({

            version,

            auth: state,

            logger,

            browser: Browsers.ubuntu("Chrome"),

            printQRInTerminal: false,

            markOnlineOnConnect: false,

            generateHighQualityLinkPreview: false,

            connectTimeoutMs: 60000,

            defaultQueryTimeoutMs: 60000,

            keepAliveIntervalMs: 30000,

            retryRequestDelayMs: 250

        });

        // Save authentication updates
        socket.ev.on("creds.update", saveCreds);

        // Connection events
        socket.ev.on("connection.update", (update) => {

            const {
                connection,
                lastDisconnect
            } = update;

            if (connection === "connecting") {
                console.log("[DARK DILA-MD] Connecting...");
            }

            if (connection === "open") {

                connected = true;
                starting = false;

                console.log(
                    "[DARK DILA-MD] WhatsApp Connected Successfully."
                );
            }

            if (connection === "close") {

                connected = false;
                starting = false;

                const reason =
                    lastDisconnect?.error?.output?.statusCode;

                console.log(
                    "[DARK DILA-MD] Connection Closed:",
                    reason || "Unknown"
                );

                if (reason === DisconnectReason.loggedOut) {
                    console.log(
                        "[DARK DILA-MD] Account logged out. Remove local session before pairing again."
                    );
                }

                socket = null;
            }

        });

        // Request Pair Code
        const code = await socket.requestPairingCode(number);

        starting = false;

        console.log("[DARK DILA-MD] Pair Code Generated.");

        return res.status(200).json({

            success: true,

            code: code,

            message: "Enter this code in WhatsApp Linked Devices."

        });

    } catch (error) {

        console.error(
            "[DARK DILA-MD] Pairing Error:",
            error
        );

        starting = false;
        connected = false;
        socket = null;

        return res.status(500).json({

            success: false,

            error: "Pair Code generation failed. Check Termux logs."

        });

    }

});

// Connection status
router.get("/status", (req, res) => {

    res.json({

        success: true,

        connected: connected,

        starting: starting

    });

});

// Export router
export default router;
