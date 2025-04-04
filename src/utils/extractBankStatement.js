const fs = require("fs");
const pdf = require("pdf-parse");

/**
 * Extracts transaction data from Sycamore bank statements in PDF format
 * @param {string} filePath - Path to the PDF bank statement
 * @returns {Object} - Extracted account information and transactions
 */
const extractBankStatement = async (filePath) => {
  try {
    // Read and parse PDF
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    console.log("PDF EXTRACTION SAMPLE:", text.substring(0, 500)); // Debug log

    // Extract account information
    const accountInfo = {
      accountName: extractPattern(text, /^([A-Z][A-Z\s\-]+)[\r\n]/m),
      accountNumber: extractPattern(text, /Account Number\s*(\d+)/),
      statementPeriod: extractPattern(text, /Statement Period\s*([^\r\n]+)/),
      openingBalance: extractPattern(text, /Opening Balance\s*(NGN [0-9,.]+)/),
      closingBalance: extractPattern(text, /Closing Balance\s*(NGN [0-9,.]+)/)
    };

    // Extract monthly totals
    const monthlyTotals = [];
    const yearMonthPattern = /(20\d{2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+NGN\s+([\d,.]+)\s+NGN\s+([\d,.]+)/g;

    let yearMonthMatch;
    while ((yearMonthMatch = yearMonthPattern.exec(text)) !== null) {
      monthlyTotals.push({
        year: yearMonthMatch[1],
        month: yearMonthMatch[2],
        totalCredit: `NGN ${yearMonthMatch[3]}`,
        totalDebit: `NGN ${yearMonthMatch[4]}`
      });
    }

    // Extract transactions using a more precise approach
    const transactions = [];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // Create a pattern to match date headers and time entries
    const dateHeaderPattern = new RegExp(`(${months.join('|')})\\s+(\\d{1,2})`, 'g');
    const timeEntryPattern = /(\d{2}:\d{2}:\d{2})\s+NGN\s+([\d,.]+)\s+NGN\s+([\d,.]+)\s+([^\r\n]+)/g;

    // First, split the text into date sections
    const dateSections = text.split(dateHeaderPattern);
    let currentDate = null;
    let lastBalance = null;

    for (let i = 1; i < dateSections.length; i += 3) {
      if (i + 2 >= dateSections.length) continue;

      const month = dateSections[i];
      const day = dateSections[i + 1];
      const sectionContent = dateSections[i + 2];

      // Get year from statement period or default to current year
      let year = '2025'; // Default
      const periodMatch = accountInfo.statementPeriod.match(/(\d{4})-\d{2}-\d{2}/);
      if (periodMatch) {
        year = periodMatch[1];
      }

      // Format date as yyyy-mm-dd
      const monthIndex = months.findIndex(m => m === month) + 1;
      currentDate = `${year}-${monthIndex.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;

      // Direct regex matching for transactions in this date's section
      let transactionContent = sectionContent;

      // Try alternative extraction methods
      const timeLines = transactionContent.split('\n')
        .filter(line => /^\d{2}:\d{2}:\d{2}/.test(line.trim()));

      for (const timeLine of timeLines) {
        // Extract transaction details from following lines
        const timeMatch = timeLine.match(/^(\d{2}:\d{2}:\d{2})/);
        if (!timeMatch) continue;

        const time = timeMatch[1];

        // Find credit/debit in next line
        const sections = transactionContent.split(time)[1].trim().split(/\s{2,}|\n/);

        let credit = "NGN 0.00";
        let debit = "NGN 0.00";
        let category = "";
        let toFrom = "";
        let description = "";
        let balance = "";
        let transactionType = "UNKNOWN"; // Default transaction type

        for (let j = 0; j < sections.length; j++) {
          const section = sections[j].trim();

          // Try to identify sections
          if (section.includes("Wallet") && category === "") {
            category = section;

            // Look for credit/debit pattern within category
            const categoryAmountsMatch = section.match(/NGN\s+([\d,.]+)NGN\s+([\d,.]+)Wallet/);
            if (categoryAmountsMatch) {
              const firstAmount = parseFloat(categoryAmountsMatch[1].replace(/,/g, ''));
              const secondAmount = parseFloat(categoryAmountsMatch[2].replace(/,/g, ''));

              if (firstAmount > 0 && secondAmount === 0) {
                // First amount is present, second is zero - this is a credit
                credit = `NGN ${categoryAmountsMatch[1]}`;
                debit = "NGN 0.00";
                transactionType = "CREDIT";
              } else if (firstAmount === 0 && secondAmount > 0) {
                // First amount is zero, second is present - this is a debit
                credit = "NGN 0.00";
                debit = `NGN ${categoryAmountsMatch[2]}`;
                transactionType = "DEBIT";
              } else if (firstAmount > 0 && secondAmount > 0) {
                // Both present - use the larger one
                if (firstAmount > secondAmount) {
                  credit = `NGN ${categoryAmountsMatch[1]}`;
                  debit = "NGN 0.00";
                  transactionType = "CREDIT";
                } else {
                  credit = "NGN 0.00";
                  debit = `NGN ${categoryAmountsMatch[2]}`;
                  transactionType = "DEBIT";
                }
              }
            }
          } else if ((section.includes("/") || section.includes("Limited")) && toFrom === "") {
            toFrom = section;
          } else if (section.includes("TXT-") && description === "") {
            description = section;
          } else if (section.match(/NGN\s+[\d,.]+$/) && balance === "") {
            balance = section;

            // Extract balance amount for comparison
            const balanceMatch = section.match(/NGN\s+([\d,.]+)/);
            if (balanceMatch) {
              const currentBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));

              // Compare with last known balance if available
              if (lastBalance !== null) {
                const difference = currentBalance - lastBalance;

                // Use balance comparison to set or confirm transaction type
                if (Math.abs(difference) > 0) {
                  if (difference > 0) {
                    if (transactionType === "UNKNOWN" || transactionType === "CREDIT") {
                      credit = `NGN ${Math.abs(difference).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
                      debit = "NGN 0.00";
                      transactionType = "CREDIT";
                    }
                  } else {
                    if (transactionType === "UNKNOWN" || transactionType === "DEBIT") {
                      credit = "NGN 0.00";
                      debit = `NGN ${Math.abs(difference).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
                      transactionType = "DEBIT";
                    }
                  }
                }
              }

              lastBalance = currentBalance;
            }
          }
        }

        // Clean up category field - extract only the relevant part
        if (category && category.includes("Wallet")) {
          const walletParts = category.split("Wallet");
          if (walletParts.length > 1) {
            category = "Wallet" + walletParts[1].trim();
          }
        }

        // Special case for empty transactions - try to extract from category field directly
        if (transactionType === "UNKNOWN" && category.includes("NGN")) {
          // General NGN pattern in category
          const amounts = category.match(/NGN\s+([\d,.]+)/g);
          if (amounts && amounts.length >= 2) {
            // Extract the two amounts and determine which is credit/debit
            const amount1 = parseFloat(amounts[0].replace(/NGN\s+/, '').replace(/,/g, ''));
            const amount2 = parseFloat(amounts[1].replace(/NGN\s+/, '').replace(/,/g, ''));

            if (amount1 > 0 && amount2 === 0) {
              credit = amounts[0];
              debit = "NGN 0.00";
              transactionType = "CREDIT";
            } else if (amount1 === 0 && amount2 > 0) {
              credit = "NGN 0.00";
              debit = amounts[1];
              transactionType = "DEBIT";
            } else if (amount2 > amount1) {
              // Second amount is larger, likely a debit
              credit = "NGN 0.00";
              debit = amounts[1];
              transactionType = "DEBIT";
            } else if (amount1 > amount2) {
              // First amount is larger, might be a credit
              credit = amounts[0];
              debit = "NGN 0.00";
              transactionType = "CREDIT";
            }
          }
        }

        transactions.push({
          date: currentDate,
          time,
          credit,
          debit,
          transactionType,
          category,
          toFrom,
          description,
          balance
        });
      }
    }

    // If we still don't have transactions, try a more aggressive approach
    if (transactions.length === 0) {
      // Extract everything that looks like a time entry
      console.log("Trying aggressive extraction method"); // Debug log

      const timeRegex = /(\d{2}:\d{2}:\d{2})/g;
      let match;
      let lastFoundDate = null;
      let lastBalance = null;

      // Find all date headers first
      const dateHeaders = [];
      const dateHeaderRegex = new RegExp(`(${months.join('|')})\\s+(\\d{1,2})`, 'g');

      while ((match = dateHeaderRegex.exec(text)) !== null) {
        const month = match[1];
        const day = match[2];
        const monthIndex = months.findIndex(m => m === month) + 1;
        const date = `2025-${monthIndex.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;

        dateHeaders.push({
          date,
          position: match.index
        });
      }

      // Find all time entries
      const lines = text.split('\n');
      let currentDateHeader = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if this line is a date header
        for (const header of dateHeaders) {
          if (text.indexOf(line) >= header.position &&
              text.indexOf(line) < (header.position + line.length + 20)) {
            currentDateHeader = header.date;
            break;
          }
        }

        const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2})/);
        if (timeMatch && currentDateHeader) {
          const time = timeMatch[1];

          // Try to extract transaction details from subsequent lines
          let categoryLine = i + 1 < lines.length ? lines[i + 1] : "";
          let toFromLine = i + 2 < lines.length ? lines[i + 2] : "";
          let descriptionLine = i + 3 < lines.length ? lines[i + 3] : "";
          let balanceLine = i + 4 < lines.length ? lines[i + 4] : "";

          // Extract credit/debit amounts and transaction type
          let credit = "NGN 0.00";
          let debit = "NGN 0.00";
          let transactionType = "UNKNOWN";
          let category = categoryLine.trim();

          // Try to extract amounts from category line
          if (category.includes("NGN")) {
            const categoryAmounts = category.match(/NGN\s+([\d,.]+)/g);
            if (categoryAmounts && categoryAmounts.length >= 2) {
              // Extract the amounts
              const amount1 = parseFloat(categoryAmounts[0].replace(/NGN\s+/, '').replace(/,/g, ''));
              const amount2 = parseFloat(categoryAmounts[1].replace(/NGN\s+/, '').replace(/,/g, ''));

              if (amount1 > 0 && amount2 === 0) {
                credit = categoryAmounts[0];
                debit = "NGN 0.00";
                transactionType = "CREDIT";
              } else if (amount1 === 0 && amount2 > 0) {
                credit = "NGN 0.00";
                debit = categoryAmounts[1];
                transactionType = "DEBIT";
              } else if (amount2 > amount1) {
                // Second amount is larger, likely a debit
                credit = "NGN 0.00";
                debit = categoryAmounts[1];
                transactionType = "DEBIT";
              } else if (amount1 > amount2) {
                // First amount is larger, might be a credit
                credit = categoryAmounts[0];
                debit = "NGN 0.00";
                transactionType = "CREDIT";
              }
            }
          }

          // Clean up category - take only the part after "Wallet"
          if (category && category.includes("Wallet")) {
            const walletParts = category.split("Wallet");
            if (walletParts.length > 1) {
              category = "Wallet" + walletParts[1].trim();
            }
          }

          // Extract balance from balance line
          let balance = "NGN 0.00";
          const balanceMatch = balanceLine.match(/NGN\s+([\d,.]+)/);
          if (balanceMatch) {
            balance = `NGN ${balanceMatch[1]}`;
            const currentBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));

            // Compare with last known balance if available
            if (lastBalance !== null) {
              const difference = currentBalance - lastBalance;

              // Use balance difference to set or confirm transaction type
              if (Math.abs(difference) > 0) {
                if (difference > 0 && (transactionType === "UNKNOWN" || transactionType === "CREDIT")) {
                  credit = `NGN ${Math.abs(difference).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
                  debit = "NGN 0.00";
                  transactionType = "CREDIT";
                } else if (difference < 0 && (transactionType === "UNKNOWN" || transactionType === "DEBIT")) {
                  credit = "NGN 0.00";
                  debit = `NGN ${Math.abs(difference).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
                  transactionType = "DEBIT";
                }
              }
            }

            lastBalance = currentBalance;
          }

          transactions.push({
            date: currentDateHeader,
            time,
            credit,
            debit,
            transactionType,
            category,
            toFrom: toFromLine.trim(),
            description: descriptionLine.trim(),
            balance
          });

          // Skip the lines we've processed
          i += 4;
        }
      }
    }

    // Custom post-processing for specific transaction examples
    transactions.forEach(transaction => {
      // Extract data from specific patterns in the category field
      if (transaction.transactionType === "UNKNOWN" && transaction.category) {
        const specificPattern = transaction.category.match(/NGN\s+([\d,.]+)NGN\s+([\d,.]+)Wallet/);
        if (specificPattern) {
          const firstAmount = parseFloat(specificPattern[1].replace(/,/g, ''));
          const secondAmount = parseFloat(specificPattern[2].replace(/,/g, ''));

          if (secondAmount > 0) {
            // Found a debit transaction
            transaction.credit = "NGN 0.00";
            transaction.debit = `NGN ${specificPattern[2]}`;
            transaction.transactionType = "DEBIT";
          } else if (firstAmount > 0) {
            // Found a credit transaction
            transaction.credit = `NGN ${specificPattern[1]}`;
            transaction.debit = "NGN 0.00";
            transaction.transactionType = "CREDIT";
          }

          // Clean up the category
          const walletParts = transaction.category.split("Wallet");
          if (walletParts.length > 1) {
            transaction.category = "Wallet" + walletParts[1].trim();
          }
        }
      }
    });

    // Sort transactions by date and time
    transactions.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.time.localeCompare(b.time);
    });

    console.log(`Found ${transactions.length} transactions`); // Debug log

    return {
      accountInfo,
      totals: monthlyTotals,
      transactions,
      message: `Successfully extracted ${transactions.length} transactions from ${filePath}`
    };
  } catch (error) {
    console.error("Error in extraction:", error); // Debug log
    return {
      error: true,
      message: `Error extracting bank statement: ${error.message}`
    };
  }
};

/**
 * Helper function to extract values using regex
 */
function extractPattern(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

module.exports = extractBankStatement;
