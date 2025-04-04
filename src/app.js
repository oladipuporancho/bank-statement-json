const express = require("express");
const cors = require("cors");
const uploadRoute = require("./routes/uploadRoute");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/pdf", uploadRoute);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
