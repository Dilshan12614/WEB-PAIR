import express from "express";
import fs from "fs";
import path from "path";
import pino from "pino";
import archiver from "archiver";

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
import { upload } from "./mega.js";

const router = express.Router();

function removeFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;

        fs.rmSync(filePath, {
            recursive: true,
            force: true,
        });

        return true;
    } catch (e) {
        console.error("❌ Error removing file:", e);
        return false;
    }
}


// ==========================================
// CREATE COMPLETE SESSION ZIP
// ==========================================

function zipFolder(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const output = fs.createWriteStream(outputPath);

            const archive = archiver("zip", {
                zlib: {
                    level: 9,
                },
            });

            output.on("close", () => {
                console.log(
                    `📦 Session ZIP created: ${archive.pointer()} bytes`,
                );

                resolve();
            });

            output.on("error", reject);
            archive.on("error", reject);

            archive.pipe(output);

            // Add the complete session folder
            archive.directory(sourceDir, false);

            archive.finalize();

        } catch (error) {
            reject(error);
        }
    });
}


// ==========================================
// GET MEGA FILE ID
// ==========================================

function getMegaFileId(url) {
    try {
        const match = url.match(/\/file\/([^#]+#[^\/]+)/);

        return match ? match[1] : null;

    } catch (error) {
        console.error("❌ Mega URL error:", error);
        return null;
    }
}


// ==========================================
// PAIR ROUTE
// ==========================================

router.get("/", async (req, res) => {

    let num = req.query.number;

    if (!num) {
        return res.status(400).send({
            code: "Phone number is required.",
        });
    }

    num = String(num).replace(/[^0-9]/g, "");

    let dirs = "./" + num;

    // Remove old session
    await removeFile(dirs);


    // ==========================================
    // CHECK PHONE NUMBER
    // ==========================================

    const phone = pn("+" + num);

    if (!phone.isValid()) {

        if (!res.headersSent) {
            return res.status(400).send({
                code:
                    "Invalid phone number. Please enter your full international number without + or spaces.",
            });
        }

        return;
    }


    // Convert to E164 number
    num = phone.getNumber("e164").replace("+", "");

    // Update session directory
    dirs = "./" + num;


    // ==========================================
    // START SESSION
    // ==========================================

    async function initiateSession() {

        const { state, saveCreds } =
            await useMultiFileAuthState(dirs);

        try {

            const {
                version,
                isLatest,
            } = await fetchLatestBaileysVersion();


            console.log(
                `📦 Baileys version: ${version.join(".")}`,
            );


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


            // ==========================================
            // CONNECTION UPDATE
            // ==========================================

            KnightBot.ev.on(
                "connection.update",
                async (update) => {

                    const {
                        connection,
                        lastDisconnect,
                        isNewLogin,
                        isOnline,
                    } = update;


                    // ======================================
                    // CONNECTED
                    // ======================================

                    if (connection === "open") {

                        console.log(
                            "=================================",
                        );

                        console.log(
                            "✅ WhatsApp Connected Successfully!",
                        );

                        console.log(
                            "📱 Number:",
                            num,
                        );

                        console.log(
                            "=================================",
                        );


                        try {

                            // ==================================
                            // CREATE ZIP
                            // ==================================

                            const zipPath =
                                `./session_${num}_${Date.now()}.zip`;


                            console.log(
                                "📦 Creating complete session ZIP...",
                            );


                            await zipFolder(
                                dirs,
                                zipPath,
                            );


                            console.log(
                                "✅ Complete session ZIP created.",
                            );


                            // ==================================
                            // UPLOAD TO MEGA
                            // ==================================

                            console.log(
                                "☁️ Uploading complete session to MEGA...",
                            );


                            const megaUrl =
                                await upload(
                                    zipPath,
                                    path.basename(zipPath),
                                );


                            const megaFileId =
                                getMegaFileId(megaUrl);


                            if (!megaFileId) {

                                throw new Error(
                                    "Could not get MEGA file ID.",
                                );
                            }


                            console.log(
                                "=================================",
                            );

                            console.log(
                                "✅ Complete session uploaded!",
                            );

                            console.log(
                                "📄 SESSION ID:",
                                megaFileId,
                            );

                            console.log(
                                "=================================",
                            );


                            // ==================================
                            // SEND SESSION ID TO WHATSAPP
                            // ==================================

                            const userJid =
                                jidNormalizedUser(
                                    num +
                                    "@s.whatsapp.net",
                                );


                            await KnightBot.sendMessage(
                                userJid,
                                {
                                    text:
                                        `╭━━〔 🤖 DILA-MD 〕━━╮\n\n` +
                                        `┃ ✅ Pairing Successful!\n` +
                                        `┃\n` +
                                        `┃ 📦 Complete Session\n` +
                                        `┃ ☁️ MEGA Upload: Done\n` +
                                        `┃\n` +
                                        `┃ 🔐 SESSION ID:\n` +
                                        `┃\n` +
                                        `┃ ${megaFileId}\n` +
                                        `┃\n` +
                                        `┃ ⚠️ Keep this Session ID\n` +
                                        `┃ private.\n\n` +
                                        `╰━━━━━━━━━━━━━━━━━━━━╯`,
                                },
                            );


                            console.log(
                                "📤 Session ID sent to WhatsApp.",
                            );


                            // ==================================
                            // DELETE ZIP
                            // ==================================

                            if (
                                fs.existsSync(zipPath)
                            ) {

                                fs.unlinkSync(zipPath);

                                console.log(
                                    "🧹 Temporary ZIP deleted.",
                                );
                            }


                            // ==================================
                            // DELETE SESSION FOLDER
                            // ==================================

                            await delay(1000);

                            removeFile(dirs);

                            console.log(
                                "🧹 Local session deleted.",
                            );


                            console.log(
                                "🎉 Pairing process completed!",
                            );


                            await delay(2000);

                            process.exit(0);

                        } catch (error) {

                            console.error(
                                "❌ Session upload error:",
                                error,
                            );


                            // Remove temporary ZIP if exists
                            const files =
                                fs.readdirSync("./");

                            for (
                                const file of files
                            ) {

                                if (
                                    file.startsWith(
                                        `session_${num}_`,
                                    ) &&
                                    file.endsWith(".zip")
                                ) {

                                    try {
                                        fs.unlinkSync(
                                            `./${file}`,
                                        );
                                    } catch {}
                                }
                            }


                            removeFile(dirs);

                            await delay(2000);

                            process.exit(1);
                        }
                    }


                    // ======================================
                    // NEW LOGIN
                    // ======================================

                    if (isNewLogin) {

                        console.log(
                            "🔐 New login via pair code",
                        );
                    }


                    // ======================================
                    // ONLINE
                    // ======================================

                    if (isOnline) {

                        console.log(
                            "📶 Client is online",
                        );
                    }


                    // ======================================
                    // CONNECTION CLOSED
                    // ======================================

                    if (connection === "close") {

                        const statusCode =
                            lastDisconnect
                                ?.error
                                ?.output
                                ?.statusCode;


                        if (statusCode === 401) {

                            console.log(
                                "❌ Logged out from WhatsApp.",
                            );

                            console.log(
                                "🔄 Generate a new pair code.",
                            );

                        } else {

                            console.log(
                                "🔁 Connection closed — restarting...",
                            );

                            initiateSession();
                        }
                    }
                },
            );


            // ==========================================
            // SAVE CREDENTIALS
            // ==========================================

            KnightBot.ev.on(
                "creds.update",
                saveCreds,
            );


            // ==========================================
            // REQUEST PAIR CODE
            // ==========================================

            if (
                !KnightBot.authState.creds.registered
            ) {

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


                    if (!res.headersSent) {

                        console.log(
                            "📲 Pair Code:",
                            code,
                        );


                        await res.send({
                            code,
                        });
                    }

                } catch (error) {

                    console.error(
                        "❌ Error requesting pairing code:",
                        error,
                    );


                    if (!res.headersSent) {

                        res.status(503).send({
                            code:
                                "Failed to get pairing code. Please check your phone number and try again.",
                        });
                    }


                    setTimeout(
                        () => process.exit(1),
                        2000,
                    );
                }
            }

        } catch (err) {

            console.error(
                "❌ Error initializing session:",
                err,
            );


            if (!res.headersSent) {

                res.status(503).send({
                    code: "Service Unavailable",
                });
            }


            setTimeout(
                () => process.exit(1),
                2000,
            );
        }
    }


    await initiateSession();
});


// ==========================================
// ERROR HANDLER
// ==========================================

process.on(
    "uncaughtException",
    (err) => {

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
    },
);


export default router;
