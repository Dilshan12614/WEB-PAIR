import express from "express";
import pino from "pino";
import {
    makeWASocket,
    useMultiFileAuthState,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason
} from "@whiskeysockets/baileys";
import { isValidPhoneNumber, parsePhoneNumber } from "awesome-phonenumber";

const router = express.Router();

const SESSION_DIR = "./auth_info_baileys";

let socket = null;
let starting = false;
let connected = false;
let lastRequest = 0;

const logger = pino({ level: "silent" });

router.post("/", async (req, res) => {
    try {
        if (starting || connected) {
            return res.status(409).json({
                error: connected
                    ? "WhatsApp is already connected."
                    : "A pairing request is already running."
            });
        }

        const now = Date.now();

        if (now - lastRequest < 30000) {
            return res.status(429).json({
                error: "Please wait 30 seconds before trying again."
            });
        }

        let number = String(req.body.number || "")
            .replace(/[^0-9+]/g, "");

        if (!number.startsWith("+")) {
            number = "+" + number;
        }

        if (!isValidPhoneNumber(number)) {
            return res.status(400).json({
                error: "Enter a valid international phone number."
            });
        }

        const parsed = parsePhoneNumber(number);
        const phoneNumber = parsed.number?.e164
            ?.replace("+", "");

        if (!phoneNumber) {
            return res.status(400).json({
                error: "Invalid phone number."
            });
        }

        lastRequest = now;
        starting = true;

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
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000
        });

        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                connected = true;
                starting = false;
                console.log("DARK DILA-MD WhatsApp connected.");
            }

            if (connection === "close") {
                connected = false;
                starting = false;

                const code =
                    lastDisconnect?.error?.output?.statusCode;

                console.log("WhatsApp connection closed:", code);

                if (code === DisconnectReason.loggedOut) {
                    console.log(
                        "WhatsApp logged out. Remove local session before pairing again."
                    );
                }
            }
        });

        const code = await socket.requestPairingCode(phoneNumber);

        starting = false;

        return res.json({
            success: true,
            code,
            message: "Enter this code in WhatsApp Linked Devices."
        });

    } catch (error) {
        console.error("Pairing error:", error);
        starting = false;

        return res.status(500).json({
            error: "Could not generate Pair Code. Check the Termux logs."
        });
    }
});

router.get("/status", (req, res) => {
    res.json({
        connected,
        starting
    });
});

export default router;
