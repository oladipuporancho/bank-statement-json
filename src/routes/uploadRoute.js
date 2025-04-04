const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const extractBankStatement = require("../utils/extractBankStatement");

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "../../uploads");
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({ storage });

router.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
        const filePath = req.file.path;
        const result = await extractBankStatement(filePath);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
