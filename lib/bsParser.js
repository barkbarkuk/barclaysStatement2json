var nodeUtil = require("util"),
    nodeEvents = require("events"),
	_ = require('underscore'),
	bsParserUtils = require('./bsParserUtils');

var BSParser = (function () {
	'use strict';
    
    var parseGroupedDescriptionTextIntoTransaction = function (transaction, groupedText) {
    	// Parse known text fields
    	if (groupedText[0].indexOf("Card Payment") == 0) {
    		transaction.type = "Card Payment";
    		
			//"to" &  "on"
			var match;
			if (match = /Card Payment to (.+) ([A-Z]{3} [\d\.]+) on (.+) at (.+) Exchange Rate ([\d\.]+)/.exec(groupedText[0])) {
				transaction.to = match[1];
				transaction.exchangeValue = match[2];
				transaction.when = match[3];
				transaction.exchangeRate = match[5];
			} else if (match = /Card Payment to (.+) on (.+)/.exec(groupedText[0])) {
				transaction.to = match[1];
				transaction.when = match[2];
			} else if (match = /Card Payment to (.+)/.exec(groupedText[0])) {
				transaction.to = match[1];
			}
    	} else if (groupedText[0].indexOf("Bill payment") == 0) {
    		transaction.type = "Online Payment";
    		
    		//"to" 
    		var toIndex = groupedText[0].indexOf(" to ")
    		if (toIndex !== -1) {
    			transaction.to = groupedText[0].slice(toIndex + " to ".length);
    		}
    		
    		//"?Ref:"
    		if (groupedText[1] && groupedText[1].indexOf("Ref: ") == 0) {
    			transaction.reference = groupedText[1].slice("Ref: ".length);
    		}
    	} else if (groupedText[0].indexOf("Received") == 0) {
    		transaction.type = "Payment Received";
    		
    		//"from"
    		var fromIndex = groupedText[0].indexOf(" from ")
    		if (fromIndex !== -1) {
    			transaction.from = groupedText[0].slice(fromIndex + " from ".length);
    		}
    		
    		//"?Ref:"
    		if (groupedText[1] && groupedText[1].indexOf("Ref: ") == 0) {
    			transaction.reference = groupedText[1].slice("Ref: ".length);
    		}
    	} else if (groupedText[0].indexOf("Cash Machine Withdrawal") == 0) { 
    		transaction.type = "Cash Machine Withdrawal";
    		
    		//"at"
    		var whereIndex = groupedText[0].indexOf(" at ")
    		if (whereIndex !== -1) {
    			transaction.where = groupedText[0].slice(whereIndex + " at ".length);
    		}
    		
    		// "Timed at"
    		if (groupedText[1] && groupedText[1].indexOf("Timed at ") == 0) {
    			transaction.when = groupedText[1].slice("Timed at ".length);
    		}
    	} else if (groupedText[0].indexOf("Cash Machine Mobile Phone Top Up") == 0) {
    		transaction.type = "Cash Machine Mobile Phone Top Up";
    		
    		//"at"
    		var whereIndex = groupedText[0].indexOf(" at ")
    		if (whereIndex !== -1) {
    			transaction.where = groupedText[0].slice(whereIndex + " at ".length);
    		}
    		
    		// "Timed at"
    		if (groupedText[1] && groupedText[1].indexOf("Timed at ") == 0) {
    			transaction.when = groupedText[1].slice("Timed at ".length);
    		}
    	} else if (groupedText[0].indexOf("Transfer") == 0) {
    		transaction.type = "Transfer";
    		
    		//"to"
    		var toAccountAndSortCode = / to Sort Code (\d{2}-\d{2}-\d{2}) Account (\d+)/.exec(groupedText[0]);
    		if (toAccountAndSortCode) {
    			transaction.to = { account: toAccountAndSortCode[2], sortCode: toAccountAndSortCode[1] };
    		}
    	} else if (groupedText[0].indexOf("Direct Debit") == 0) {
    		transaction.type = "Direct Debit";
    		
    		// to
    		var toIndex = groupedText[0].indexOf(" to ")
    		if (toIndex !== -1) {
    			transaction.to = groupedText[0].slice(toIndex + " to ".length);
    		}
    		
    		// Ref:
    		if (groupedText[1] && groupedText[1].indexOf("Ref: ") == 0) {
    			var firstDDIndex = groupedText[1].indexOf("This is a new Direct Debit Payment");
    			if (firstDDIndex === -1) {
    				transaction.reference = groupedText[1].slice("Ref: ".length);
    			} else {
    				transaction.reference = groupedText[1].slice("Ref: ".length, firstDDIndex - 1);
    				transaction.newDirectDebit = true;
    			}
    		}
    	} else if (groupedText[0].indexOf("Payment") == 0) {
    		transaction.type = "Payment";
    		// probably always foreign transactions?
    		
    		// to
    		var toIndex = groupedText[0].indexOf(" to ")
    		if (toIndex !== -1) {
    			transaction.to = groupedText[0].slice(toIndex + " to ".length);
    		}
    		
    		if (groupedText[1]) {
    			var exchangeValue = /This transaction was for (\S+)/.exec(groupedText[1]);
    			var exchangeRate = /at exch rate (\S+)/.exec(groupedText[1]);
    			var transactionWhen = /This transaction .+ on (\d+ [A-Za-z]+)/.exec(groupedText[1]);
    			var commission = /and includes commission of (\S+)/.exec(groupedText[1]);
    			var cardPurchase = /Card Purchase/.exec(groupedText[1]);
    			
    			if (exchangeValue) {
    				transaction.exchangeValue = exchangeValue[1];
    			}
    			if (exchangeRate) {
    				transaction.exchangeRate = exchangeRate[1];
    			}
    			if (transactionWhen) {
    				transaction.when = transactionWhen[1];
    			}
    			if (commission) {
    				transaction.commission = commission[1];
    			}
    			if (cardPurchase) {
    				// Should we set the transaction type here instead of a boolean?
    				transaction.cardPurchase = true;
    			}
    		}
    	} else if (groupedText[0].indexOf("Account Credit") == 0) {
    		transaction.type = "Account Credit";
    		
    		//"at"
    		var whereIndex = groupedText[0].indexOf(" at ")
    		if (whereIndex !== -1) {
    			transaction.where = groupedText[0].slice(whereIndex + " at ".length);
    		}
    	} else if (groupedText[0].indexOf("Start balance") == 0) {
    		transaction.type = "Start balance";
    	} else if (groupedText[0].indexOf("End balance") == 0) {
    		transaction.type = "End balance";
    	} else {
    		// Unknown
    		transaction.type = "Other";
    		transaction.otherData = groupedText;
    	}
    }
    
    var transactionTablesToRecords = function (meta, transactionTables) {
    	var statementStart = new Date(meta.statementPeriod.start),
    		statementDate = meta.statementDate;
    	var currentDate, groupedText, transactions = [], tableIndex = 0, tableTransactionIndex = 0, dateTransactionIndex = 0;
    	
    	transactionTables.forEach(function (tableContents) {
    		for (var row = 0; row < tableContents.length; row++) {
    			var currentRow = tableContents[row];
    			var transaction = {};
    			if (currentRow[0].text.length > 0 && (currentDate !== bsParserUtils.addYearToPartialDate(bsParserUtils.cleanedTextString(currentRow[0].text[0]), statementStart))) {
    				var oldDate = currentDate;
    				currentDate = bsParserUtils.addYearToPartialDate(bsParserUtils.cleanedTextString(currentRow[0].text[0]), statementStart);
    				dateTransactionIndex = 0;
    			}
    			
    			if (currentRow[1].text.length > 0) {
    				var descriptionTexts = currentRow[1].text;
    				groupedText = bsParserUtils.groupDescriptionTextsByTextStyle(descriptionTexts);
    				parseGroupedDescriptionTextIntoTransaction(transaction, groupedText);
    			}
    			
    			if (currentRow[2].text.length > 0) {
    				transaction.moneyOut = decodeURIComponent(currentRow[2].text[0].R[0].T);
    			}
    			
    			if (currentRow[3].text.length > 0) {
    				transaction.moneyIn = decodeURIComponent(currentRow[3].text[0].R[0].T);
    			}
    			
    			if (currentRow[4].text.length > 0) {
    				transaction.balance = decodeURIComponent(currentRow[4].text[0].R[0].T);
    			}
    			
    			if (Object.keys(transaction).length !== 0) {
    				transaction.date = currentDate;
    				transaction.meta = { 
    					dateOfStatement: statementDate, 
    					statementTableId: tableIndex, 
    					tableTransactionId: tableTransactionIndex,
    					dateTransactionId: dateTransactionIndex
    				};
    				
    				transactions.push(transaction);
    				tableTransactionIndex++;
    				dateTransactionIndex++;
    			}
    		}
    		tableTransactionIndex = 0;
    		tableIndex++;
    	});
    	return transactions;
    }
	
	// Table Column Headers are expected to be the page's text objects for: Date, Description, Money Out, Money In, Balance
	var getTableFollowingHeader = function (page, tableColumnHeaders) {
		var tableHeaderY = tableColumnHeaders[0].y;
		
		var dateText = tableColumnHeaders[0], 
			descriptionText = tableColumnHeaders[1], 
			moneyOutText = tableColumnHeaders[2], 
			moneyInText =  tableColumnHeaders[3], 
			balanceText =  tableColumnHeaders[4];
		
		var tableWidth = balanceText.x - dateText.x;  // First stab at getting a width for the table
		var tableHeight = page.height - tableHeaderY; // First stab at getting a height for the table body
		var tableBodyBound = { x1: dateText.x, x2: balanceText.x, y1: tableHeaderY, y2: tableHeaderY + tableHeight };
		
		// Find the lines directly below the table header text to get the extents of each table column 
		//    (we can't just use text starting x alignment because columns are aligned both left and right with no text width coming from the pdf parsing)
		var verticallyAlignedHLineGroups;
		if (!page.HLinesGroupedByY) {
			page.HLinesGroupedByY = bsParserUtils.groupHLinesByYAndDeduplicate(page.HLinesByYThenX);
		}
		verticallyAlignedHLineGroups = page.HLinesGroupedByY;
		
		var orderedHLineYsBelowColumnHeader = Object.keys(verticallyAlignedHLineGroups)
			.map(function (key) { return +key; })   // Force the 'y' key to be a number
			.filter(function (y) { return y > tableHeaderY; })
			.sort(function (a, b) { return +a < +b ? -1 : +a > +b ? 1 : 0; });
		
		// The statement has 4 lines under the table headers one for each column, except description/moneyOut which share a line
		var columnHeaderUnderlines;
		var headerUnderlinesIndex = 0
		while ((columnHeaderUnderlines = verticallyAlignedHLineGroups[orderedHLineYsBelowColumnHeader[headerUnderlinesIndex]]).length < 4) {
			headerUnderlinesIndex++;
		}

		// With the header underlines collected we can now determine the column bounds for grouping text
		var dateColumnXBounds = { x1: columnHeaderUnderlines[0].x, x2: columnHeaderUnderlines[0].x + columnHeaderUnderlines[0].l };
		var descriptionColumnXBounds = { x1: dateColumnXBounds.x2, x2: moneyOutText.x };
		var moneyOutColumnXBounds = { x1: moneyOutText.x, x2: columnHeaderUnderlines[1].x + columnHeaderUnderlines[1].l };
		var moneyInColumnXBounds = { x1: moneyOutColumnXBounds.x2, x2: columnHeaderUnderlines[2].x + columnHeaderUnderlines[2].l };
		var balanceColumnXBounds = { x1: moneyInColumnXBounds.x2, x2: columnHeaderUnderlines[3].x + columnHeaderUnderlines[3].l };
		tableWidth = balanceColumnXBounds.x2 - dateColumnXBounds.x1;

		
		// Find the bottom of the table by finding the first full width line after the column headers
		var tableEndLine = _.find(page.HLinesByYThenX, function (hLine) {
			return hLine.y > tableHeaderY && hLine.x === dateColumnXBounds.x1 && hLine.l === tableWidth;
		});
		
		// Hack because left most column text x position not under column header. May be issue in pdf.js, pdf2json or the pdf itself. Cheating is quickest resolution
		dateColumnXBounds.x1 = 0;
		
		
		// Every transaction row will have either at least one of 'Money out', 'Money in' or 'Balance' at the same level as the description text
		var rowChangeColumnBounds = { x1: moneyOutColumnXBounds.x1, x2: balanceColumnXBounds.x2 };
		var rowChangeTextYs = page.Texts
			.filter(function (text) { 
				return text.y > tableHeaderY && text.y < tableEndLine.y && text.x >= rowChangeColumnBounds.x1 && text.x <= rowChangeColumnBounds.x2; 
			})
			.map(function (text) { return text.y; });
		
		var rowBounds = [];
		var lastRowY = tableHeaderY;
		
		rowChangeTextYs.forEach(function (y) { 
			var rowBound = { y1: lastRowY, y2: y };
			rowBounds.push(rowBound);
			lastRowY = y;
		});
		rowBounds.push({y1: lastRowY, y2: tableEndLine.y });
		
		var columnBounds = [ dateColumnXBounds, descriptionColumnXBounds, moneyOutColumnXBounds, moneyInColumnXBounds, balanceColumnXBounds ];
		
		// Initialise an empty table
		var tableContents = [];
		for (var row = 0; row < rowBounds.length; row++) {
			tableContents[row] = [];
			for (var column = 0; column < columnBounds.length; column++) {
				tableContents[row][column] = { row: row, column: column, text: [] };
			}
		}
		
		// Filter out text outside the table bounds
		var tableText = page.TextsByYThenX.filter(function (text) { return text.y > tableHeaderY && text.y < tableEndLine.y; });
		
		// Iterate through all of the text and assign to a table cell
		tableText.forEach(function (text) {
			var row = 0, rowFound = false, column = 0, columnFound = false;
			while (!rowFound && row < rowBounds.length) {
				rowFound = text.y >= rowBounds[row].y1 && text.y < rowBounds[row].y2;
				if (!rowFound) {
					row++;
				}
			}
			if (!rowFound) {
				return;
			}
			
			while (!columnFound && column < columnBounds.length) {
				columnFound = text.x >= columnBounds[column].x1 && text.x < columnBounds[column].x2;
				if (!columnFound) {
					column++;
				}
			}
			if (!columnFound) {
				return;
			}
			
			tableContents[row][column].text.push(text);
		});
		
		return tableContents;
	}
    
    var getMetaV0 = function (pages) {
    	var meta = {};
    	var firstPage = pages[0];
    	var orderedText = firstPage.TextsByYThenX;
    		
    	var metaColumnX = orderedText[0].x - 1;  // Adding a fudge factor for bullet points
    	var metaText = orderedText.filter(function (text) { return text.x >= metaColumnX; });
    	
		meta.statementPeriod = bsParserUtils.parseStatementPeriodText(metaText[3]);
		if (meta.statementPeriod.error) {
			return statementPeriod;
		}
    	meta.accountHolder = bsParserUtils.cleanedTextString(metaText[5]);
    	meta.statementDate = new Date(bsParserUtils.cleanedTextString(metaText[6]).slice("Statement date ".length));
    	meta.lastStatementDate = new Date(bsParserUtils.cleanedTextString(metaText[7]).slice("Last statement ".length));
    	meta.sortCode = bsParserUtils.cleanedTextString(metaText[8]).slice("Sort Code ".length);
    	meta.accountNumber = bsParserUtils.cleanedTextString(metaText[10]);
    	meta.swiftbic = bsParserUtils.cleanedTextString(metaText[12]);
    	meta.iban = bsParserUtils.cleanedTextString(metaText[14]);
    	meta.startBalance = bsParserUtils.cleanedTextString(metaText[18]);
    	meta.moneyIn = bsParserUtils.cleanedTextString(metaText[20]);
    	meta.moneyOut = bsParserUtils.cleanedTextString(metaText[22]);
    	meta.endBalance = bsParserUtils.cleanedTextString(metaText[24]);
    	meta.overdraftLimit = bsParserUtils.cleanedTextString(metaText[27]).slice("Overdraft limit ".length);
    	meta.reserve = bsParserUtils.cleanedTextString(metaText[28]).slice("Reserve ".length);
    	
    	var otherText = orderedText.filter(function (text) { return text.x < (metaColumnX); }); // Add a fudge factor
    	var addressX = otherText[0].x;
    	meta.address = [];
    	var i = 0;
    	while (otherText[i].x === addressX) {
    		meta.address.push(bsParserUtils.cleanedTextString(otherText[i]));
    		i++;
    	}

    	return meta;
    }
	
	var getMetaV1 = function (pages) {
    	var meta = {};
    	var firstPage = pages[0];
    	var orderedText = firstPage.TextsByYThenX;
    		
    	var metaColumnX = orderedText[2].x - 1;  // Adding a fudge factor for bullet points
    	var metaText = orderedText.filter(function (text) { return text.x >= metaColumnX; });
    	
    	meta.statementPeriod = bsParserUtils.parseStatementPeriodText(metaText[3]);
		if (meta.statementPeriod.error) {
			return statementPeriod;
		}
    	meta.accountHolder = bsParserUtils.cleanedTextString(metaText[4]);
		
		meta.sortCode = bsParserUtils.cleanedTextString(metaText[5]).slice("Sort Code ".length);
    	meta.accountNumber = bsParserUtils.cleanedTextString(metaText[7]);
    	meta.swiftbic = bsParserUtils.cleanedTextString(metaText[8]).slice("SWIFTBIC ".length);
    	meta.iban = bsParserUtils.cleanedTextString(metaText[10]);
    	
    	meta.startBalance = bsParserUtils.cleanedTextString(metaText[14]);
    	meta.moneyIn = bsParserUtils.cleanedTextString(metaText[16]);
    	meta.moneyOut = bsParserUtils.cleanedTextString(metaText[18]);
    	meta.endBalance = bsParserUtils.cleanedTextString(metaText[20]);
    	meta.overdraftLimit = bsParserUtils.cleanedTextString(metaText[24]);
    	meta.reserve = bsParserUtils.cleanedTextString(metaText[26]);
    	
    	var otherText = orderedText.filter(function (text) { return text.x < (metaColumnX); }); // Add a fudge factor
		
		meta.statementDate = new Date(bsParserUtils.cleanedTextString(otherText[0]).slice("Statement date ".length));
    	meta.lastStatementDate = new Date(bsParserUtils.cleanedTextString(otherText[1]).slice("Last statement ".length));
		
    	var addressX = otherText[2].x;
    	meta.address = [];
    	var i = 2;
    	while (otherText[i].x === addressX) {
    		meta.address.push(bsParserUtils.cleanedTextString(otherText[i]));
    		i++;
    	}
    	
    	return meta;
    }
	
	var getMetaV2 = function (pages) {
    	var meta = {};
    	var firstPage = pages[1];
    	var orderedText = firstPage.TextsByYThenX;

    	var metaColumnX = orderedText[2].x - 1;  // Adding a fudge factor for bullet points
    	var metaText = orderedText.filter(function (text) { return text.x >= metaColumnX; });
    	
    	meta.statementPeriod = bsParserUtils.parseStatementPeriodText(metaText[3]);
		if (meta.statementPeriod.error) {
			return statementPeriod;
		}
    	meta.accountHolder = bsParserUtils.cleanedTextString(metaText[4]);
		meta.sortCode = bsParserUtils.cleanedTextString(metaText[5]).slice("Sort Code ".length);
    	meta.accountNumber = bsParserUtils.cleanedTextString(metaText[7]);
    	meta.swiftbic = bsParserUtils.cleanedTextString(metaText[8]).slice("SWIFTBIC ".length);
    	meta.iban = bsParserUtils.cleanedTextString(metaText[10]);
    	meta.startBalance = bsParserUtils.cleanedTextString(metaText[14]);
    	meta.moneyIn = bsParserUtils.cleanedTextString(metaText[16]);
    	meta.moneyOut = bsParserUtils.cleanedTextString(metaText[18]);
    	meta.endBalance = bsParserUtils.cleanedTextString(metaText[20]);
    	meta.overdraftLimit = bsParserUtils.cleanedTextString(metaText[24]);
    	meta.reserve = bsParserUtils.cleanedTextString(metaText[26]);
    	
    	var otherText = orderedText.filter(function (text) { return text.x < (metaColumnX); }); // Add a fudge factor
		
		meta.statementDate = new Date(bsParserUtils.cleanedTextString(otherText[0]).slice("Statement date ".length));
    	meta.lastStatementDate = new Date(bsParserUtils.cleanedTextString(otherText[1]).slice("Last statement ".length));
		
    	var addressX = otherText[2].x;
    	meta.address = [];
    	var i = 2;
    	while (otherText[i].x === addressX) {
    		meta.address.push(bsParserUtils.cleanedTextString(otherText[i]));
    		i++;
    	}

    	return meta;
    }
	
	// Rudimentary version checking. Currently only used so we can parse out the meta data easily by 'version'.
	var determineStatementVersion = function(pages) {
    	var orderedText = pages[0].TextsByYThenX;
		
		if (bsParserUtils.cleanedTextString(orderedText[0]) === "Barclays Bank") {
			return 0;
    	}
		
		if (bsParserUtils.cleanedTextString(orderedText[1]).indexOf("Statement date") === 0) {
			return 1;
    	}
		
		if ((bsParserUtils.cleanedTextString(orderedText[0]).indexOf("Your statement") === 0) 
				&& (bsParserUtils.cleanedTextString(orderedText[8]).indexOf("Your accounts at a glance") === 0)){
			return 2;
    	}
		
		return -1;
	};
	
	// TODO: Instead of hacky version system, get the meta by searching for the text and joining Text objects on same line
	var getMeta = function (pages) {
		var version = determineStatementVersion(pages);
		if (version === -1) {
			return { error: "Cannot parse statement metadata" };
		}
		
		if (version === 0) {
			return getMetaV0(pages);
		}
		
		if (version === 1) {
			return getMetaV1(pages);
		}
		
		if (version === 2) {
			return getMetaV2(pages);
		}
	}
		
    var parse = function (data) {
		var pages = data.Pages;
		
    	var meta = getMeta(pages);
		if (meta.error) {
			return meta;
		}
	
    	var transactionTables = [];
    	
    	for (var pageId = 0, numPages = pages.length; pageId < numPages; pageId++) {
    		var page = pages[pageId];
    		
			// Find a table if it exists in the page
			var tableHeadingMatches = bsParserUtils.searchForTableHeaders(page, ["Date", "Description", "Money out", "Money in", "Balance"]);
			if (tableHeadingMatches.length === 0) {
				continue;
			}
			
			// Break table down into columns and rows
			tableHeadingMatches.forEach(function (tableColumnHeaders) {
				var tableContents = getTableFollowingHeader(page, tableColumnHeaders);
				transactionTables.push(tableContents);
			});
    	};
		
		if (transactionTables.length === 0) {
			return { error: "No transaction tables found in parsed document" };
		}

		// Convert Text objects from the table into transaction JSON
    	var transactions = transactionTablesToRecords(meta, transactionTables);
		
    	var statement = { meta: meta, transactions: transactions };
	
		return statement;
	}
	
    return { parse: parse };
})();

module.exports = BSParser;
