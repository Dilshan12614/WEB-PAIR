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

        let zipPath = `./session_${num}_${Date.now()}.zip`;

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

            KnightBot.ev.on("creds.update", saveCreds);

            // ==========================================
            // CONNECTION UPDATE
            // ==========================================

            KnightBot.ev.on(
                "connection.update",
                async (update) => {

                    const {
                        connection,
                        lastDisconnect
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
                            
                            const userJid = jidNormalizedUser(KnightBot.user.id);
                            
                            await KnightBot.sendMessage(userJid, {
                                text: megaFileId
                            });

                            await delay(3000);
                            removeFile(zipPath);
                            removeFile(dirs);

                            if (!res.headersSent) {
                                return res.status(200).send({
                                    code: megaFileId,
                                });
                            }

                        } catch (error) {
                            console.error("❌ Process Error:", error);
                            removeFile(zipPath);
                            removeFile(dirs);
                            if (!res.headersSent) {
                                res.status(500).send({ code: "Internal server error occurred." });
                            }
                        }
                    }

                    // ======================================
                    // CONNECTION CLOSED OR FAILED
                    // ======================================
                    if (connection === "close") {
                        const reason = lastDisconnect?.error?.output?.statusCode;
                        console.log(`❌ Connection closed. Reason code: ${reason}`);
                    }
                },
            );

            // Pair Code එක වෙබ් අඩවිය හරහා පරිශීලකයාට පෙන්වීම
            await delay(2000);
            const code = await KnightBot.requestPairingCode(num);
            
            if (!res.headersSent) {
            
return res.status(200).send({ code });
}
} catch (err) {
console.error("❌ Session Initialization Error:", err);
removeFile(dirs);
if (!res.headersSent) {
res.status(500).send({ code: "Failed to start session." });
}
}
}
initiateSession();
});
export default router;
