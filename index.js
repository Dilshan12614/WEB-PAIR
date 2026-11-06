import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pairRouter from "./pair.js";

const app = express();
const PORT = process.env.PORT || 8000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "pair.html"));
});

app.use("/pair", pairRouter);

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        name: "DARK DILA-MD"
    });
});

// Local device only: do not expose this server publicly.
app.listen(PORT, "127.0.0.1", () => {
    console.log("================================");
    console.log("       DARK DILA-MD");
    console.log("================================");
    console.log(`Website: http://127.0.0.1:${PORT}`);
    console.log("Pair Code service is ready.");
});
