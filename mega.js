import * as mega from "megajs";
import fs from "fs";

const auth = {
    email: "dilshanashinsa93@gmail.com", // your mega account login email
    password: "Rathnayake",
    userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
};

function createStorage() {
    if (!auth.email || !auth.password) {
        throw new Error("MEGA_EMAIL or MEGA_PASSWORD is missing in Secrets.");
    }

    return new Promise((resolve, reject) => {
        const storage = new mega.Storage(auth, (err) => {
            if (err) {
                storage.close();
                reject(err);
            } else {
                resolve(storage);
            }
        });

        storage.on("error", reject);
    });
}

export const upload = async (filePath, fileName) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const storage = await createStorage();

    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(filePath);

        const uploadStream = storage.upload({
            name: fileName,
            allowUploadBuffering: true,
        });

        let finished = false;

        const fail = (error) => {
            if (finished) return;
            finished = true;
            storage.close();
            reject(error);
        };

        readStream.on("error", fail);
        uploadStream.on("error", fail);

        uploadStream.on("complete", (file) => {
            file.link((err, url) => {
                if (err) return fail(err);

                if (finished) return;
                finished = true;
                storage.close();
                resolve(url);
            });
        });

        readStream.pipe(uploadStream);
    });
};

export const download = (url) => {
    return new Promise((resolve, reject) => {
        try {
            const file = mega.File.fromURL(url);

            file.loadAttributes((err) => {
                if (err) return reject(err);

                file.downloadBuffer((downloadError, buffer) => {
                    if (downloadError) return reject(downloadError);

                    if (!buffer || !buffer.length) {
                        return reject(new Error("Downloaded file is empty."));
                    }

                    resolve(buffer);
                });
            });
        } catch (error) {
            reject(error);
        }
    });
};
