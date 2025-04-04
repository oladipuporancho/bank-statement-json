const fs = require("fs");
const pdfParse = require("pdf-parse");

/**
 * Extracts text from a PDF file and returns JSON format.
 * @param {string} filePath - Path to the PDF file.
 * @returns {Promise<Object>}
 */
const extractBankStatement = async (filePath) => {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);

        const text = data.text;
        const transactions = parseTextToJson(text);

        return { success: true, transactions };
    } catch (error) {
        console.error("Error extracting PDF:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Parses the extracted text into a JSON structure.
 * @param {string} text - Extracted text from the PDF.
 * @returns {Array} - List of transactions.
 */
const parseTextToJson = (text) => {
    const lines = text.split("\n").map(line => line.trim()).filter(line => line);
    let transactions = [];

    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/);

        if (parts.length >= 5) {
            const [date, description, debit, credit, balance] = parts;
            transactions.push({
                date,
                description,
                debit: debit === "-" ? 0 : parseFloat(debit.replace(/,/g, "")),
                credit: credit === "-" ? 0 : parseFloat(credit.replace(/,/g, "")),
                balance: parseFloat(balance.replace(/,/g, ""))
            });
        }
    }

    return transactions;
};

module.exports = { extractBankStatement };
