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
const logger = pino({ level: "silent" });
const activePairingJobs = new Set();

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
        const archive = archiver("zip", { zlib: { level: 6 } });

        output.on("close", () => resolve(outputFile));
        output.on("error", reject);
        archive.on("error", reject);

        archive.pipe(output);
        // creds.json and Signal key files are placed directly at ZIP root.
        archive.directory(sourceDir, false);
        archive.finalize().catch(reject);
    });
}

function getMegaFileId(url) {
    if (typeof url !== "string") return null;
    const match = url.match(/\/file\/([^#]+)#([^/?]+)/);
    return match ? `${match[1]}#${match[2]}` : null;
}

router.get("/", async (req, res) => {
    let number = String(req.query.number || "").replace(/\D/g, "");

    if (!number) {
        return res.status(400).json({
            error: "Please provide an international phone number.",
        });
    }

    const phone = pn("+" + number);
    if (!phone.isValid()) {
        return res.status(400).json({
            error: "Invalid international phone number.",
        });
    }

    number = phone.getNumber("e164").replace("+", "");

    if (activePairingJobs.has(number)) {
        return res.status(409).json({
            error: "A pairing session for this number is already running.",
        });
    }

    activePairingJobs.add(number);

    const sessionDir = path.join(process.cwd(), `session_${number}`);
    const zipPath = path.join(
        os.tmpdir(),
        `session_${number}_${Date.now()}.zip`
    );

    removeFile(sessionDir);

    let bot = null;
    let pairingCodeRequested = false;
    let uploadStarted = false;
    let finished = false;
    let restartCount = 0;
    const maxRestarts = 3;

    function finishJob() {
        if (finished) return;
        finished = true;
        activePairingJobs.delete(number);
        removeFile(zipPath);
    }

    async function connectSocket() {
        if (finished || uploadStarted) return;

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const currentBot = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.windows("Chrome"),
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
        });

        bot = currentBot;
        currentBot.ev.on("creds.update", saveCreds);

        currentBot.ev.on("connection.update", async (update) => {
            if (bot !== currentBot || finished) return;

            const { connection, lastDisconnect, isNewLogin } = update;

            if (isNewLogin) {
                console.log("New WhatsApp login detected.");
            }

            if (connection === "open") {
                if (uploadStarted) return;
                uploadStarted = true;

                console.log("WhatsApp connected. Preparing full session ZIP...");

                try {
                    await delay(2500);

                    const credsPath = path.join(sessionDir, "creds.json");
                    if (!fs.existsSync(credsPath)) {
                        throw new Error("creds.json was not created.");
                    }

                    const authFiles = fs.readdirSync(sessionDir);
                    if (authFiles.length < 2) {
                        throw new Error(
                            "Session folder does not contain the Signal key files."
                        );
                    }

                    await zipFolder(sessionDir, zipPath);

                    console.log("Uploading complete session ZIP to MEGA...");
                    const megaUrl = await upload(
                        zipPath,
                        `session_${number}_${Date.now()}.zip`
                    );

                    const megaFileId = getMegaFileId(megaUrl);
                    if (!megaFileId) {
                        throw new Error(
                            "Could not read the MEGA file ID and key from the upload link."
                        );
                    }

                    const sessionId = `THENUVA-XMD=${megaFileId}`;
                    const userJid = jidNormalizedUser(
                        `${number}@s.whatsapp.net`
                    );
                    const pushName =
                        currentBot.user?.name ||
                        currentBot.user?.verifiedName ||
                        "User";

                    await currentBot.sendMessage(userJid, {
                        text:
                            `╭───────────────●●►\n` +
                            `│ 🤖 *THENUVA X MD*\n` +
                            `╰───────────────●●►\n\n` +
                            `👤 *USER DETAILS*\n` +
                            `│ Name: ${pushName}\n` +
                            `│ Number: +${number}\n` +
                            `│ Status: Connected ✅\n\n` +
                            `🔐 *SESSION ID*\n` +
                            `${sessionId}\n\n` +
                            `✅ Complete session uploaded\n` +
                            `⚠️ Keep your Session ID private.`
                    });

                    console.log("Complete session uploaded successfully.");
                    console.log("Session generation completed.");

                    await delay(1000);
                    removeFile(sessionDir);

                    try {
                        currentBot.end(undefined);
                    } catch (error) {
                        // The socket may already be closed.
                    }

                    finishJob();
                } catch (error) {
                    console.error("Session upload failed:", error);
                    try {
                        currentBot.end(error);
                    } catch (closeError) {
                        // Ignore socket cleanup errors.
                    }
                    finishJob();
                }
            }

            if (connection === "close") {
                const statusCode =
                    lastDisconnect?.error?.output?.statusCode ??
                    lastDisconnect?.error?.statusCode;

                console.log("Connection closed. Status:", statusCode);

                if (statusCode === 401) {
                    console.error("WhatsApp session logged out (401).");
                    finishJob();
                    return;
                }

                if (restartCount >= maxRestarts) {
                    console.error("Reconnect limit reached. Pairing job stopped.");
                    finishJob();
                    return;
                }

                restartCount += 1;

                if (statusCode === 515) {
                    console.log(
                        `Baileys restart required. Reconnecting (${restartCount}/${maxRestarts})...`
                    );
                } else {
                    console.log(
                        `Connection lost. Reconnecting (${restartCount}/${maxRestarts})...`
                    );
                }

                try {
                    await delay(statusCode === 515 ? 1000 : 2000);
                    if (bot === currentBot && !finished && !uploadStarted) {
                        await connectSocket();
                    }
                } catch (error) {
                    console.error("Reconnect failed:", error);
                    finishJob();
                }
            }
        });

        // Request the pairing code once only. A 515 reconnect reuses saved auth.
        if (!state.creds.registered && !pairingCodeRequested) {
            pairingCodeRequested = true;
            await delay(3000);

            if (bot !== currentBot || finished) return;

            const code = await currentBot.requestPairingCode(number);
            const formattedCode =
                code?.match(/.{1,4}/g)?.join("-") || code;

            if (!res.headersSent) {
                res.json({ code: formattedCode });
            }

            console.log(
                "Pairing code generated. Enter it in WhatsApp Linked Devices."
            );
        }
    }

    try {
        await connectSocket();
    } catch (error) {
        console.error("Session initialization failed:", error);

        if (!res.headersSent) {
            res.status(503).json({
                error: "Failed to initialize WhatsApp pairing. Check the Replit console.",
            });
        }

        try {
            bot?.end(error);
        } catch (closeError) {
            // Ignore socket cleanup errors.
        }

        finishJob();
    }
});

export default router;
