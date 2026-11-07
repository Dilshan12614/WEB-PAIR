import * as mega from "megajs";
import fs from "fs";

const auth = {
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
    userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};

function checkAuth() {
    if (!auth.email || !auth.password) {
        throw new Error("MEGA_EMAIL or MEGA_PASSWORD is missing");
    }
}

export const upload = (filePath, fileName) => {
    return new Promise((resolve, reject) => {
        try {
            checkAuth();

            if (!fs.existsSync(filePath)) {
                return reject(new Error("File not found: " + filePath));
            }

            const storage = new mega.Storage(auth, (err) => {
                if (err) {
                    storage.close();
                    return reject(err);
                }

                const readStream = fs.createReadStream(filePath);

                const uploadStream = storage.upload({
                    name: fileName,
                    allowUploadBuffering: true,
                });

                readStream.on("error", (error) => {
                    storage.close();
                    reject(error);
                });

                uploadStream.on("error", (error) => {
                    storage.close();
                    reject(error);
                });

                uploadStream.on("complete", (file) => {
                    file.link((err, url) => {
                        storage.close();

                        if (err) return reject(err);
                        resolve(url);
                    });
                });

                readStream.pipe(uploadStream);
            });
        } catch (error) {
            reject(error);
        }
    });
};

export const download = (url) => {
    return new Promise((resolve, reject) => {
        try {
            if (!url) {
                return reject(new Error("MEGA URL is required"));
            }

            const file = mega.File.fromURL(url);

            file.loadAttributes((err) => {
                if (err) return reject(err);

                file.downloadBuffer((err, buffer) => {
                    if (err) return reject(err);
                    resolve(buffer);
                });
            });
        } catch (error) {
            reject(error);
        }
    });
};
