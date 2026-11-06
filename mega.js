import * as mega from "megajs";
import fs from "fs";

const auth = {
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
    userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
};

export const upload = async (filePath, fileName) => {
    if (!auth.email || !auth.password) {
        throw new Error("MEGA credentials are missing.");
    }

    if (!fs.existsSync(filePath)) {
        throw new Error("Session file does not exist.");
    }

    let storage;

    try {
        storage = await new Promise((resolve, reject) => {
            const instance = new mega.Storage(auth, error => {
                if (error) reject(error);
                else resolve(instance);
            });

            instance.on("error", reject);
        });

        const uploadStream = storage.upload({
            name: fileName,
            allowUploadBuffering: true
        });

        const readStream = fs.createReadStream(filePath);

        const uploadedFile = await new Promise((resolve, reject) => {
            readStream.on("error", reject);
            uploadStream.on("error", reject);
            uploadStream.on("complete", resolve);

            readStream.pipe(uploadStream);
        });

        const url = await new Promise((resolve, reject) => {
            uploadedFile.link((error, link) => {
                if (error) reject(error);
                else resolve(link);
            });
        });

        return url;

    } finally {
        if (storage) {
            try {
                storage.close();
            } catch {}
        }
    }
};

export const download = async (url) => {
    if (!url) {
        throw new Error("MEGA download URL is missing.");
    }

    const file = mega.File.fromURL(url);

    await new Promise((resolve, reject) => {
        file.loadAttributes(error => {
            if (error) reject(error);
            else resolve();
        });
    });

    return await new Promise((resolve, reject) => {
        file.downloadBuffer((error, buffer) => {
            if (error) reject(error);
            else resolve(buffer);
        });
    });
};
