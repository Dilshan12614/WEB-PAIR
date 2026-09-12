import * as mega from "megajs";
import fs from "fs";

// Mega authentication credentials
const auth = {
    email: "dilshanashinsa793@gmail.com", 
    password: "P3i2pc:we6JmpP_", 
    userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246",
};

export const upload = (filePath, fileName) => {
    return new Promise((resolve, reject) => {
        try {
            const storage = new mega.Storage(auth, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                const readStream = fs.createReadStream(filePath);

                const uploadStream = storage.upload({
                    name: fileName,
                    allowUploadBuffering: true,
                });

                readStream.pipe(uploadStream);

                uploadStream.on("complete", (file) => {
                    file.link((err, url) => {
                        if (err) {
                            reject(err);
                        } else {
                            storage.close();
                            
                            // 🛠️ මෙතනින් https://mega.nz කෑල්ල අයින් කරලා කේතය විතරක් ගන්නවා
                            const megaCode = url.replace('https://mega.nz', '');
                            
                            // 🧚‍♂️ ඔයා ඉල්ලපු විදිහටම DILSHAN-MD~ කෑල්ල ඉස්සරහට එකතු කරනවා
                            const shortSessionId = `DILSHAN-MD~${megaCode}`;
                            
                            resolve(shortSessionId);
                        }
                    });
                });

                uploadStream.on("error", (error) => {
                    reject(error);
                });

                readStream.on("error", (error) => {
                    reject(error);
                });
            });

            storage.on("error", (error) => {
                reject(error);
            });
        } catch (err) {
            reject(err);
        }
    });
};

export const download = (url) => {
    return new Promise((resolve, reject) => {
        try {
            // සෙෂන් ID එකෙන් නැවත ඩවුන්ලෝඩ් කරද්දී DILSHAN-MD~ කෑල්ල තිබ්බොත් ඒක අයින් කරලා මුල් ලින්ක් එක හදනවා
            let rawUrl = url;
            if (url.includes('DILSHAN-MD~')) {
                rawUrl = 'https://mega.nz' + url.replace('DILSHAN-MD~', '');
            }

            const file = mega.File.fromURL(rawUrl);

            file.loadAttributes((err) => {
                if (err) {
                    reject(err);
                    return;
                }

                file.downloadBuffer((err, buffer) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer);
                    }
                });
            });
        } catch (err) {
            reject(err);
        }
    });
};
