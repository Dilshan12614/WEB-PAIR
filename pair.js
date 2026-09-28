import express from "express";
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


// ==========================================
// REMOVE OLD SESSION
// ==========================================

function removeFile(filePath) {
    try {
        const fs = require("fs");

        if (!fs.existsSync(filePath)) {
            return false;
        }

        fs.rmSync(filePath, {
            recursive: true,
            force: true,
        });

        return true;

    } catch (error) {
        console.error(
            "❌ Error removing session:",
            error
        );

        return false;
    }
}


// ==========================================
// PAIR ROUTE
// ==========================================

router.get("/", async (req, res) => {

    let num = req.query.number;


    // ==========================================
    // CHECK NUMBER
    // ==========================================

    if (!num) {
        return res.status(400).json({
            code: "Phone number is required.",
        });
    }


    // Remove spaces, + and symbols
    num = String(num).replace(/[^0-9]/g, "");


    // ==========================================
    // VALIDATE PHONE NUMBER
    // ==========================================

    const phone = pn("+" + num);

    if (!phone.isValid()) {

        return res.status(400).json({
            code:
                "Invalid phone number. Enter your full international number without + or spaces.",
        });

    }


    // Convert to international format
    num = phone
        .getNumber("e164")
        .replace("+", "");


    // ==========================================
    // SESSION DIRECTORY
    // ==========================================

    const sessionDir = `./auth_${num}`;


    try {

        console.log(
            "================================="
        );

        console.log(
            "📱 Starting WhatsApp pairing..."
        );

        console.log(
            "📱 Number:",
            num
        );

        console.log(
            "================================="
        );


        // ==========================================
        // LOAD AUTH STATE
        // ==========================================

        const {
            state,
            saveCreds,
        } = await useMultiFileAuthState(
            sessionDir
        );


        // ==========================================
        // GET BAILEYS VERSION
        // ==========================================

        const {
            version,
        } = await fetchLatestBaileysVersion();


        console.log(
            "📦 Baileys version:",
            version.join(".")
        );


        // ==========================================
        // CREATE WHATSAPP SOCKET
        // ==========================================

        const KnightBot = makeWASocket({

            version,

            auth: {
                creds: state.creds,

                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    pino({
                        level: "fatal",
                    })
                ),
            },


            logger: pino({
                level: "fatal",
            }),


            // Pairing compatibility
            browser: Browsers.macOS(
                "Safari"
            ),


            printQRInTerminal: false,


            markOnlineOnConnect: false,


            generateHighQualityLinkPreview: false,


            defaultQueryTimeoutMs: 60000,


            connectTimeoutMs: 60000,


            keepAliveIntervalMs: 30000,


            retryRequestDelayMs: 250,


            syncFullHistory: false,


            fireInitQueries: true,


            shouldIgnoreJid: () => false,

        });


        // ==========================================
        // SAVE CREDENTIALS
        // ==========================================

        KnightBot.ev.on(
            "creds.update",
            saveCreds
        );


        // ==========================================
        // CONNECTION UPDATE
        // ==========================================

        KnightBot.ev.on(
            "connection.update",
            async (update) => {

                const {
                    connection,
                    lastDisconnect,
                } = update;


                // -------------------------------
                // CONNECTING
                // -------------------------------

                if (
                    connection === "connecting"
                ) {

                    console.log(
                        "🔄 Connecting to WhatsApp..."
                    );

                }


                // -------------------------------
                // CONNECTED
                // -------------------------------

                if (
                    connection === "open"
                ) {

                    console.log(
                        "================================="
                    );

                    console.log(
                        "✅ WhatsApp connected successfully!"
                    );

                    console.log(
                        "📱 Number:",
                        num
                    );

                    console.log(
                        "================================="
                    );

                }


                // -------------------------------
                // CONNECTION CLOSED
                // -------------------------------

                if (
                    connection === "close"
                ) {

                    const reason =
                        lastDisconnect
                            ?.error
                            ?.output
                            ?.statusCode;


                    console.log(
                        "❌ WhatsApp connection closed."
                    );

                    console.log(
                        "Reason code:",
                        reason || "Unknown"
                    );

                }

            }
        );


        // ==========================================
        // WAIT BEFORE REQUESTING PAIRING CODE
        // ==========================================

        await delay(3000);


        console.log(
            "📲 Requesting WhatsApp pairing code..."
        );


        // ==========================================
        // GENERATE PAIRING CODE
        // ==========================================

        const code =
            await KnightBot.requestPairingCode(
                num
            );


        console.log(
            "================================="
        );

        console.log(
            "🔐 PAIRING CODE:",
            code
        );

        console.log(
            "================================="
        );


        // ==========================================
        // SEND CODE TO WEBSITE
        // ==========================================

        if (!res.headersSent) {

            return res.status(200).json({
                code: code,
            });

        }

    } catch (error) {

        console.error(
            "❌ Pairing Error:",
            error
        );


        // Don't delete the auth folder
        // automatically after an error.
        // This prevents unnecessary session loss.


        if (!res.headersSent) {

            return res.status(500).json({
                code:
                    "Failed to generate pairing code.",
                error:
                    error?.message || "Unknown error",
            });

        }

    }

});


export default router;
