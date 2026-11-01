import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import pino from "pino";
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
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { recursive: true, force: true });
        }
    } catch (error) {
        console.error("Cleanup error:", error);
    }
}

function zipFolder(sourceDir, outputFile) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputFile);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => resolve(outputFile));
        output.on("error", reject);
        archive.on("error", reject);

        archive.pipe(output);

        // Store auth files directly at ZIP root
        archive.directory(sourceDir, false);

        archive.finalize();
    });
}

function getMegaFileId(url) {
    try {
        const match = url.match(/\/file\/([^#]+#[^/]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

router.get("/", async (req, res) => {
    let num = String(req.query.number || "").replace(/[^0-9]/g, "");

    if (!num) {
        return res.status(400).send({
            code: "Please provide a phone number.",
        });
    }

    const phone = pn("+" + num);

    if (!phone.isValid()) {
        return res.status(400).send({
            code: "Invalid international phone number.",
        });
    }

    num = phone.getNumber("e164").replace("+", "");

    const dirs = path.join(process.cwd(), `session_${num}`);
    const zipPath = path.join(os.tmpdir(), `session_${num}_${Date.now()}.zip`);

    removeFile(dirs);

    let bot;

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();

            bot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" })
                    ),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.windows("Chrome"),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
            });

            bot.ev.on("creds.update", saveCreds);

            bot.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect, isNewLogin } = update;

                if (connection === "open") {
                    console.log("WhatsApp connected. Preparing full session ZIP...");

                    try {
                        // Allow pending auth key updates to finish
                        await delay(2000);

                        const credsPath = path.join(dirs, "creds.json");

                        if (!fs.existsSync(credsPath)) {
                            throw new Error("creds.json was not created.");
                        }

                        const authFiles = fs.readdirSync(dirs);

                        if (authFiles.length < 2) {
                            throw new Error(
                                "Session folder does not contain enough auth files."
                            );
                        }

                        await zipFolder(dirs, zipPath);

                        console.log("Uploading complete session ZIP to MEGA...");

                        const megaUrl = await upload(
                            zipPath,
                            `session_${num}_${Date.now()}.zip`
                        );

                        const megaFileId = getMegaFileId(megaUrl);

                        if (!megaFileId) {
                            throw new Error("Could not extract MEGA file ID.");
                        }

                        const sessionId = `THENUVA-XMD=${megaFileId}`;
                        const userJid = jidNormalizedUser(
                            num + "@s.whatsapp.net"
                        );

                        const pushName =
                            bot.user?.name ||
                            bot.user?.verifiedName ||
                            "User";

                        await bot.sendMessage(userJid, {
                            text:
                                `╭───────────────●●►\n` +
                                `│ 🤖 *THENUVA X MD*\n` +
                                `╰───────────────●●►\n\n` +
                                `👤 *USER DETAILS*\n` +
                                `│ Name: ${pushName}\n` +
                                `│ Number: +${num}\n` +
                                `│ Status: Connected ✅\n\n` +
                                `🔐 *SESSION ID*\n` +
                                `${sessionId}\n\n` +
                                `✅ Complete session uploaded\n` +
                                `⚠️ Keep your Session ID private.`
                        });

                        console.log("Complete session uploaded successfully.");

                        await delay(1500);

                        removeFile(dirs);
                        removeFile(zipPath);

                        try {
                            bot.end(undefined);
                        } catch {}

                        console.log("Session generation completed.");
                        setTimeout(() => process.exit(0), 1500);
                    } catch (error) {
                        console.error("Session upload failed:", error);

                        removeFile(zipPath);

                        // Keep local auth files for debugging/recovery
                        setTimeout(() => process.exit(1), 2000);
                    }
                }

                if (isNewLogin) {
                    console.log("New WhatsApp login detected.");
                }

                if (connection === "close") {
                    const statusCode =
                        lastDisconnect?.error?.output?.statusCode;

                    console.log("Connection closed. Status:", statusCode);

                    if (statusCode === 401) {
                        console.log("WhatsApp session logged out.");
                        setTimeout(() => process.exit(1), 1500);
                    } else {
                        console.log("Connection closed. Please retry pairing.");
                        setTimeout(() => process.exit(1), 1500);
                    }
                }
            });

            if (!state.creds.registered) {
                await delay(3000);

                const code = await bot.requestPairingCode(num);
                const formattedCode =
                    code?.match(/.{1,4}/g)?.join("-") || code;

                if (!res.headersSent) {
                    return res.send({ code: formattedCode });
                }
            }
        } catch (error) {
            console.error("Session initialization failed:", error);

            if (!res.headersSent) {
                res.status(503).send({
                    code: "Failed to initialize WhatsApp session.",
                });
            }

            setTimeout(() => process.exit(1), 2000);
        }
    }

    await initiateSession();
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
});

export default router;
