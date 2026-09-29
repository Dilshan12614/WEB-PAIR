import express from "express";
import fs from "fs";
import pino from "pino";
import crypto from "crypto";

import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

import pn from "awesome-phonenumber";

const router = express.Router();

/* ═══════════════════════════════════════════════
   🖼️ IMAGE URL
   👉 PASTE YOUR DIRECT IMAGE URL HERE
   ═══════════════════════════════════════════════ */

const imageUrl = "PASTE_YOUR_IMAGE_URL_HERE";


/* ═══════════════════════════════════════════════
   📢 NEWSLETTER DETAILS
   👉 CHANGE THESE VALUES
   ═══════════════════════════════════════════════ */

const newsletterName = "YOUR NEWSLETTER NAME";
const newsletterJid = "YOUR_NEWSLETTER_JID";


/* ═══════════════════════════════════════════════
   🧹 REMOVE TEMP SESSION
   ═══════════════════════════════════════════════ */

function removeFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;

        fs.rmSync(filePath, {
            recursive: true,
            force: true,
        });

        return true;
    } catch (error) {
        console.error("❌ Error removing file:", error);
        return false;
    }
}


/* ═══════════════════════════════════════════════
   🔐 NON-SENSITIVE SESSION ID
   ═══════════════════════════════════════════════ */

function generateSessionId() {
    return `THENUVA-XMD=${crypto.randomUUID()}`;
}


/* ═══════════════════════════════════════════════
   🚀 PAIRING ROUTE
   ═══════════════════════════════════════════════ */

router.get("/", async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({
            code: "Please enter a phone number.",
        });
    }

    let dirs = "./" + String(num);

    await removeFile(dirs);

    /* Clean phone number */
    num = String(num).replace(/[^0-9]/g, "");

    const phone = pn("+" + num);

    if (!phone.isValid()) {
        return res.status(400).send({
            code:
                "Invalid phone number. Please enter your full international number without + or spaces.",
        });
    }

    num = phone.getNumber("e164").replace("+", "");


    /* ═════════════════════════════════════════════
       🔥 START SESSION
       ═════════════════════════════════════════════ */

    async function initiateSession() {
        const { state, saveCreds } =
            await useMultiFileAuthState(dirs);

        try {
            const { version } =
                await fetchLatestBaileysVersion();


            const KnightBot = makeWASocket({
                version,

                auth: {
                    creds: state.creds,

                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({
                            level: "fatal",
                        }).child({
                            level: "fatal",
                        }),
                    ),
                },

                printQRInTerminal: false,

                logger: pino({
                    level: "fatal",
                }).child({
                    level: "fatal",
                }),

                browser: Browsers.windows("Chrome"),

                markOnlineOnConnect: false,

                generateHighQualityLinkPreview: false,

                defaultQueryTimeoutMs: 60000,

                connectTimeoutMs: 60000,

                keepAliveIntervalMs: 30000,

                retryRequestDelayMs: 250,

                maxRetries: 5,
            });


            /* Save credentials */
            KnightBot.ev.on(
                "creds.update",
                saveCreds,
            );


            /* ═════════════════════════════════════════
               📡 CONNECTION UPDATE
               ═════════════════════════════════════════ */

            KnightBot.ev.on(
                "connection.update",
                async (update) => {

                    const {
                        connection,
                        lastDisconnect,
                        isNewLogin,
                        isOnline,
                    } = update;


                    /* ═══════════════════════════════════
                       🟢 WHATSAPP CONNECTED
                       ═══════════════════════════════════ */

                    if (connection === "open") {

                        console.log(
                            "==========================================",
                        );

                        console.log(
                            "✅ WhatsApp connected successfully!",
                        );

                        console.log(
                            "=========================================="
                        );


                        try {

                            /* Generate safe Session ID */
                            const sessionId =
                                generateSessionId();


                            /* User JID */
                            const userJid =
                                jidNormalizedUser(
                                    num +
                                        "@s.whatsapp.net",
                                );


                            /* ═══════════════════════════
                               👤 GET PUSH NAME
                               ═══════════════════════════ */

                            const pushName =
                                KnightBot.user?.name ||
                                KnightBot.user?.verifiedName ||
                                "WhatsApp User";


                            /* ═══════════════════════════
                               💬 CONNECTED MESSAGE
                               ═══════════════════════════ */

                            const connectedMessage =

                                "╭━━━〔 👑 THENUVA-XMD 👑 〕━━━╮\n" +
                                "┃\n" +
                                `┃ 👋 *HELLO ${pushName}!* ✨\n` +
                                "┃\n" +
                                "┃ 🎉 *WHATSAPP CONNECTED* 🎉\n" +
                                "┃ ━━━━━━━━━━━━━━━━━━━━━\n" +
                                "┃\n" +
                                "┃ ✅ Your WhatsApp has been\n" +
                                "┃    connected successfully! 🚀\n" +
                                "┃\n" +
                                "┃ 👤 *PUSH NAME*\n" +
                                `┃ └─ ${pushName}\n` +
                                "┃\n" +
                                "┃ 📱 *PHONE NUMBER*\n" +
                                `┃ └─ +${num}\n` +
                                "┃\n" +
                                "┃ 🔐 *SESSION ID*\n" +
                                "┃ ━━━━━━━━━━━━━━━━━━━━━\n" +
                                `┃ 🆔 ${sessionId}\n` +
                                "┃\n" +
                                "┃ 🟢 *CONNECTION:* ONLINE\n" +
                                "┃ ✅ *STATUS:* SUCCESSFUL\n" +
                                "┃ ⚡ *SYSTEM:* THENUVA-XMD\n" +
                                "┃\n" +
                                "┃ 📢 *NEWSLETTER*\n" +
                                "┃ ━━━━━━━━━━━━━━━━━━━━━\n" +
                                `┃ 📛 *NAME:* ${newsletterName}\n` +
                                `┃ 🆔 *JID:* ${newsletterJid}\n` +
                                "┃\n" +
                                "┃ 💚 Thank you for using\n" +
                                "┃    *THENUVA-XMD* 👑\n" +
                                "┃\n" +
                                "╰━━〔 🚀 POWERED BY THENUVA-XMD 〕━━╯\n\n" +
                                "✨ *Stay Connected • Stay Awesome* ✨";


                            /* ═══════════════════════════
                               🖼️ SEND IMAGE + CAPTION
                               ═══════════════════════════ */

                            if (
                                imageUrl &&
                                imageUrl !==
                                    "PASTE_YOUR_IMAGE_URL_HERE"
                            ) {

                                await KnightBot.sendMessage(
                                    userJid,
                                    {
                                        image: {
                                            url: imageUrl,
                                        },
                                        caption:
                                            connectedMessage,
                                    },
                                );

                                console.log(
                                    "📸 Image + connected message sent successfully!",
                                );

                            } else {

                                /* If image URL isn't configured,
                                   send text instead. */

                                await KnightBot.sendMessage(
                                    userJid,
                                    {
                                        text:
                                            connectedMessage,
                                    },
                                );

                                console.log(
                                    "📨 Connected message sent successfully!",
                                );
                            }


                            console.log(
                                "📄 Session ID:",
                                sessionId,
                            );


                            /* ═══════════════════════════
                               ⏳ WAIT FOR MESSAGE
                               ═══════════════════════════ */

                            await delay(5000);


                            console.log(
                                "🧹 Cleaning temporary session...",
                            );

                            removeFile(dirs);

                            console.log(
                                "✅ Temporary session cleaned.",
                            );

                            console.log(
                                "🎉 Pairing process completed!",
                            );


                            await delay(2000);

                            process.exit(0);

                        } catch (error) {

                            console.error(
                                "❌ Error sending connected message:",
                                error,
                            );

                            removeFile(dirs);

                            await delay(2000);

                            process.exit(1);
                        }
                    }


                    /* ═══════════════════════════════════
                       🔐 NEW LOGIN
                       ═══════════════════════════════════ */

                    if (isNewLogin) {

                        console.log(
                            "🔐 New login via pairing code",
                        );
                    }


                    /* ═══════════════════════════════════
                       📶 ONLINE
                       ═══════════════════════════════════ */

                    if (isOnline) {

                        console.log(
                            "📶 WhatsApp client is online",
                        );
                    }


                    /* ═══════════════════════════════════
                       🔴 CONNECTION CLOSED
                       ═══════════════════════════════════ */

                    if (connection === "close") {

                        const statusCode =
                            lastDisconnect
                                ?.error
                                ?.output
                                ?.statusCode;


                        console.log(
                            "⚠️ WhatsApp connection closed:",
                            statusCode || "unknown",
                        );


                        if (statusCode === 401) {

                            console.log(
                                "❌ Logged out from WhatsApp.",
                            );

                            removeFile(dirs);

                        } else {

                            console.log(
                                "🔁 Connection closed — restarting...",
                            );

                            await delay(2000);

                            initiateSession().catch(
                                (error) => {
                                    console.error(
                                        "❌ Restart error:",
                                        error,
                                    );
                                },
                            );
                        }
                    }
                },
            );


            /* ═════════════════════════════════════════
               🔑 REQUEST PAIRING CODE
               ═════════════════════════════════════════ */

            if (!state.creds.registered) {

                await delay(3000);

                try {

                    let code =
                        await KnightBot.requestPairingCode(
                            num,
                        );


                    code =
                        code
                            ?.match(/.{1,4}/g)
                            ?.join("-") ||
                        code;


                    console.log(
                        "📱 Phone:",
                        num,
                    );

                    console.log(
                        "🔐 Pairing Code:",
                        code,
                    );


                    if (!res.headersSent) {

                        await res.send({
                            code: code,
                        });
                    }

                } catch (error) {

                    console.error(
                        "❌ Error requesting pairing code:",
                        error,
                    );


                    if (!res.headersSent) {

                        return res.status(503).send({
                            code:
                                "Failed to get pairing code. Please check your phone number and try again.",
                        });
                    }


                    setTimeout(() => {
                        process.exit(1);
                    }, 2000);
                }
            }

        } catch (error) {

            console.error(
                "❌ Error initializing session:",
                error,
            );


            if (!res.headersSent) {

                res.status(503).send({
                    code: "Service Unavailable",
                });
            }


            setTimeout(() => {
                process.exit(1);
            }, 2000);
        }
    }


    await initiateSession();
});


/* ═══════════════════════════════════════════════
   🛡️ ERROR HANDLER
   ═══════════════════════════════════════════════ */

process.on("uncaughtException", (err) => {

    const e = String(err);


    if (e.includes("conflict")) return;

    if (e.includes("not-authorized")) return;

    if (e.includes("Socket connection timeout")) return;

    if (e.includes("rate-overlimit")) return;

    if (e.includes("Connection Closed")) return;

    if (e.includes("Timed Out")) return;

    if (e.includes("Value not found")) return;


    if (
        e.includes("Stream Errored") ||
        e.includes(
            "Stream Errored (restart required)",
        )
    ) {
        return;
    }


    if (
        e.includes("statusCode: 515") ||
        e.includes("statusCode: 503")
    ) {
        return;
    }


    console.log(
        "Caught exception:",
        err,
    );

    process.exit(1);
});


export default router;
