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
    		
            //"from" 
            var fromIndex = groupedText[0].indexOf(" from ")
            if (fromIndex !== -1) {
                transaction.from = groupedText[0].slice(fromIndex + " from ".length);
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

                if (currentRow[0].text.length > 0) {
                    var dateText = currentRow[0].text.map(function (txt) { return bsParserUtils.cleanedTextString(txt); }).join(' ');
                    if (currentDate !== bsParserUtils.addYearToPartialDate(dateText, statementStart)) {
                        var oldDate = currentDate;
                        currentDate = bsParserUtils.addYearToPartialDate(dateText, statementStart);
                        dateTransactionIndex = 0;
                    }
                }
    			
    			if (currentRow[1].text.length > 0) {
    				var descriptionTexts = currentRow[1].text;
    				groupedText = bsParserUtils.groupDescriptionTextsByTextStyle(descriptionTexts);
    				parseGroupedDescriptionTextIntoTransaction(transaction, groupedText);
    			}
    			
    			if (currentRow[2].text.length > 0) {
    				transaction.moneyOut = decodeURIComponent(currentRow[2].text[0].R[0].T).replace(',','');
    			}
    			
    			if (currentRow[3].text.length > 0) {
    				transaction.moneyIn = decodeURIComponent(currentRow[3].text[0].R[0].T).replace(',','');
    			}
    			
    			if (currentRow[4].text.length > 0) {
    				transaction.balance = decodeURIComponent(currentRow[4].text[0].R[0].T).replace(',','');
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
        var notQuiteFullTableWidth = balanceColumnXBounds.x1 - dateColumnXBounds.x1;
		
		// Find the bottom of the table by finding the first full width line after the column headers
		var tableEndLine = _.find(page.HLinesByYThenX, function (hLine) {
//			return hLine.y > tableHeaderY && hLine.x === dateColumnXBounds.x1 && hLine.l === tableWidth;
            // This is a cheat because in some statements the line lengths are marginally short
            return hLine.y > tableHeaderY && hLine.x === dateColumnXBounds.x1 && hLine.l >= notQuiteFullTableWidth;
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
    
    var getMetaAll = function (pages) {
        var meta = {};

        var dateFormat = "\\d{2} [A-Za-z]{3} \\d{4}";
        var moneyFormat = "\\W{1}[0-9.,]+";

        var currentPageIndex = 0;

        while (!meta.statementDate && !meta.lastStatementDate && currentPageIndex < pages.length) {
            var currentPage = pages[currentPageIndex];
            var orderedText = currentPage.TextsByYThenX;

            var metaSearch = {
                // accountHolder: {
                //     searchTerm: '',
                //     startingIndex: null
                // },
                statementPeriod: {
                    dataRE: "\\d{2}(?: [A-Za-z]{3}(?: \\d{4})?)? \\W{1} " + dateFormat,
                    startingIndex: null,
                    data: null
                },
                statementDate: {
                    labelRE: "statement date",
                    dataRE: dateFormat,
                    startingIndex: null,
                    data: null
                },
                lastStatementDate: {
                    labelRE: "last statement",
                    dataRE: dateFormat,
                    startingIndex: null,
                    data: null
                },
                accountNumber: {
                    labelRE: "account no",
                    dataRE: "\\d{8}",
                    startingIndex: null,
                    data: null
                },
                sortCode: {
                    labelRE: "sort code",
                    dataRE: "\\d{2}-\\d{2}-\\d{2}",
                    startingIndex: null,
                    data: null
                },
                startBalance: {
                    labelRE: "start balance",
                    dataRE: moneyFormat,
                    startingIndex: null,
                    data: null
                },
                moneyIn: {
                    labelRE: "money in",
                    dataRE: moneyFormat,
                    startingIndex: null,
                    data: null
                },
                moneyOut: {
                    labelRE: "money out",
                    dataRE: moneyFormat,
                    startingIndex: null,
                    data: null
                },
                endBalance: {
                    labelRE: "end balance",
                    dataRE: moneyFormat,
                    startingIndex: null,
                    data: null
                },
                overdraftLimit: {
                    labelRE: "(?:overdraft limit|overdraft)",
                    dataRE: moneyFormat,
                    startingIndex: null,
                    data: null
                },
                reserve: {
                    labelRE: "(?:reserve|borrowing)",
                    dataRE: moneyFormat,
                    startingIndex: null,
                    data: null
                },
                swiftbic: {
                    labelRE: "swiftbic",
                    dataRE: "\\w+",
                    startingIndex: null,
                    data: null
                },
                iban: {
                    labelRE: "iban",
                    dataRE: "\\w{4} \\w{4} \\w{4} \\w{4} \\w{4} \\w{2}",
                    startingIndex: null,
                    data: null
                }
            }

            var i = 0;
            var metaKeysToFind = Object.keys(metaSearch).filter(function (metaItemKey) { return metaSearch[metaItemKey].startingIndex === null; });
            while (metaKeysToFind.length > 0 && i < orderedText.length) {
                var currentText = bsParserUtils.cleanedTextString(orderedText[i]).toLowerCase();
                // console.log("Attempting match on '" + currentText + "'");
                for (var j = 0; j < metaKeysToFind.length; j++) {
                    var metaKeyToFind = metaKeysToFind[j];
                    var searchItem = metaSearch[metaKeyToFind];
                    var searchTerm = searchItem.labelRE || searchItem.dataRE;
                    var searchExpression = new RegExp("^\s*" + searchTerm + "\s*(.*)\s*");
                    var dataMatchExpression = new RegExp("\s*(" + searchItem.dataRE + ")\s*");
                    var match = searchExpression.exec(currentText);
                    if (match) {
                        // console.log("Found '" + searchTerm + "' at " + i + ": " + bsParserUtils.cleanedTextString(orderedText[i]));

                        if (!searchItem.labelRE) {
                            searchItem.data = match[0];
                        } else if (match[1]) {
                            var dataMatch = dataMatchExpression.exec(match[1]);
                            if (dataMatch) {
                                // console.log("Data: " + dataMatch[1]);
                                searchItem.data = dataMatch[1];
                            } else {
                                // console.log("Non-matched data: " + match[1]);
                            }
                        }
                        searchItem.startingIndex = i;

                        var k = i + 1;
                        while (!searchItem.data && k < orderedText.length) {
                            var dataText = bsParserUtils.cleanedTextString(orderedText[k]);
                            var dataMatch = dataMatchExpression.exec(dataText);
                            if (dataMatch) {
                                // console.log("Data: " + dataMatch[1]);
                                searchItem.data = dataMatch[1];
                            }
                            k++;
                        }

                        break;
                    }
                }
                i++;
            }


            Object.keys(metaSearch).filter(function (key) { return !!metaSearch[key].data; }).forEach(function (key) { 
                meta[key] = metaSearch[key].data;
            });

            currentPageIndex++;
        }

        var missingMeta = Object.keys(metaSearch).filter(function (key) { return !metaSearch[key].data; });
        if (meta.statementDate && meta.lastStatementDate) {
            meta.metaPage = currentPageIndex - 1;
        }

        if (meta.statementPeriod) {
            meta.statementPeriod = bsParserUtils.parseStatementPeriodText(meta.statementPeriod);
        }
        // console.log(meta);
        // console.log("Missing meta", missingMeta);
        return meta;
    }
		
    var parse = function (data) {
		var pages = data.Pages;
		
    	var meta = getMetaAll(pages);
		if (meta.error) {
			return meta;
		}

        // return {};

    	var transactionTables = [];
    	
    	for (var pageId = meta.metaPage, numPages = pages.length; pageId < numPages; pageId++) {
    		var page = pages[pageId];
    		
			// Find a table if it exists in the page
			var tableHeadingMatches = bsParserUtils.searchForTableHeaders(page, ["Date", "Description", "Money out", "Money in", "Balance"]);

			if (tableHeadingMatches.length === 0) {
                // console.log("Couldn't find table heading matches (Page " + pageId + ")");
				continue;
			}
            
			// Break table down into columns and rows
            // console.log("Found table heading matches (Page " + pageId + ")");
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
