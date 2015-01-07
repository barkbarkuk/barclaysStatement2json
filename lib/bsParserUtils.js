var nodeUtil = require("util"),
    nodeEvents = require("events"),
	_ = require('underscore');

var BSParserUtils = (function () {
	'use strict';
	
	var filterTextEntries = function (page, filterText) {
    	return page.Texts.filter(function (textEntry) { 
    		return textEntry.R.filter(function (textRun) {
    			var match = textRun.T.trim().indexOf(filterText) !== -1
    			return match;
    		}).length > 0;
    	});
    };
    
	var objectKeysSortedNumerically = function (object) {
		return sortAsNumbers(Object.keys(object));
	}
	
	var sortedYsFromCollection = function(collection) {
		return sortAsNumbers(collection.map(function (entity) { return entity.y; }));
	}
	
	var clonePages = function(pages) {
		// To preserve the originally parsed PDF, we'll clone (selectively shallow copy) the bits we are interested in so we can augment
		// without worrying about losing things or side effects
		var pagesClone = _.clone(pages);
		pagesClone.forEach(function (page) {
			page.Texts = page.Texts.map(function (text) {
				return _.clone(text);
			});
			
			page.HLines = page.HLines.map(function (hline) {
				return _.clone(hline);
			});
		});
		return pagesClone;
	}
	
	var sortTextPages = function(pages) {
		// Adds a TextsByYThenX collection to each page, with the Texts collection sorted by location
		pages.forEach(function (page) {
			page.TextsByYThenX = page.Texts.sort(sortByYThenX); 
		});
		return pages;
	}
	
	var sortHLinesInPages = function(pages) {
		// Adds a HLinesByYThenX collection to each page, with the Texts collection sorted by location
		pages.forEach(function (page) {
			page.HLinesByYThenX = page.HLines.sort(sortByYThenX); 
		});
		return pages;
	}
	
	var addPageIdToTexts = function(pages) {
		var pageId = 0;
		pages.forEach(function (page) {
			page.Texts.forEach(function (text) {
				text.page = pageId;
			});
			pageId++;
		});
	}
	
	var inHeaderRegion = function (page, y) {
		return y < (page.Height / 10);
	};
	
	var inFooterRegion = function (page, y) {
		return y > (page.Height - (page.Height / 10));
	};

	var getArrayOfSortedTextPages = function (pages) {
		var sortedTextPages = pages.map(function (page) { 
			return page.TextsByYThenX; 
		});
		return sortedTextPages;
	}
		
	var groupTextByY = function (sortedText) {
		var yGroupedText = _.groupBy(sortedText, 'y');
		var sortedYs = sortAsNumbers(Object.keys(yGroupedText));
		var yGroupsArray = sortedYs.reduce(function (prev, curr, i, arr) {
			prev.push(yGroupedText[curr]);
			return prev;
		}, []);
		return yGroupsArray;
	}
	
	var hLineIsDuplicate = function (a, b) {
		return (a.x === b.x && 
				a.l === b.l && 
				a.oc === b.oc && 
				a.w === b.w);
	}
	
	var groupHLinesByYAndDeduplicate = function (sortedHLines) {
		
		var verticallyAlignedHLineGroups = sortedHLines.reduce(function (prev, curr, i, arr) {
			
    			if (!prev[curr.y]) {
    				prev[curr.y] = [ curr ];
    			} else {
    				// Don't add duplicates
    				if (prev[curr.y].some(function (dup) { return hLineIsDuplicate(curr, dup); })) {
    					return prev;
    				}
    				prev[curr.y].push(curr);
    			}
    			prev[curr.y] = prev[curr.y].sort(sortByX);
    			
    			return prev;
    		}, {});
		return verticallyAlignedHLineGroups;
	}
	
	// Searches a page for vertically aligned text objects matching the text of supplied column headings
	// Returns array of instances, with each instance being an array of Text objects matching the column heading text
	var searchForTableHeaders = function (page, columnHeadings) {
		var yGroupsArray = groupTextByY(page.TextsByYThenX);
		var matchingGroups = [];
		
		// Assuming the columns need to be in order, without any additional text in between headers
		// This does not handle multiple runs of text in same Text object
		yGroupsArray.forEach(function (yGroup) {
			// Find first column heading if it exists
			var firstIndex = yGroup.map(function (text) { return text.R[0].cleanT; }).indexOf(columnHeadings[0]);
			if (firstIndex !== -1) {
				var headingIndex = 1, searchIndex = firstIndex + 1, match = true;
				// Check all the other column headings follow in order
				while (match && headingIndex < columnHeadings.length && searchIndex < yGroup.length) {
					if (columnHeadings[headingIndex] !== yGroup[searchIndex].R[0].cleanT) {
						match = false;
						continue;
					}
					headingIndex++;
					searchIndex++;
				}
				
				// If all column headings were found store that group of text objects
				if (match && headingIndex === columnHeadings.length) {
					matchingGroups.push(yGroup.slice(firstIndex, searchIndex));
				}
			}
		});
		
		if (matchingGroups.length === 0) {
			return [];
		}
		
		return matchingGroups;
	};
	
    var textYPositions = function(textEntries) {
    	return textEntries.map(function (t) { return t.y; });
    };
    
    var lineIsHAlignedWithText = function(hLine, text) {
    	return hLine.x < text.x && (hLine.x + hLine.l) > (text.x + text.w);
    };
    
    var hLineXBounds = function(hLine) {
    	return { x1: hLine.x, x2: hLine.x + hLine.l };
    };
    
	var sortAsNumbers = function (collection) { return collection.sort(function (a, b) { return +a < +b ? -1 : +a > +b ? 1 : 0; }); }
	var sortAsNumbersDesc = function (collection) { return collection.sort(function (a, b) { return +a < +b ? 1 : +a > +b ? -1 : 0; }); }
	
    var sortByX = function(a, b) { return a.x < b.x ? -1 : a.x > b.x ? 1 : 0; };
    var sortByY = function(a, b) { return a.y < b.y ? -1 : a.y > b.y ? 1 : 0; };
    var sortByYThenX = function(a, b) { var yMatch = sortByY(a,b); return yMatch === 0 ? sortByX(a,b) : yMatch; };
    
    var textStyle = function(text) {
    	return { clr: text.clr, A: text.A };
    };
    
    var textStyleMatch = function(a, b) {
    	return (a.clr === b.clr && a.A === b.A);
    };
    
    var textRunStyle = function(textRun) {
    	return { S: textRun.S, TS: textRun.TS };
    };
    
    var textRunStyleMatch = function(a, b) {
    	if (a.S !== b.S || a.TS ^ b.TS) {
    		return false;
    	}
    	
    	if (a.TS) {
    		if (a.TS.length !== b.TS.length) {
    			return false;
    		}
    		for (var i = 0; i < a.TS.length; i++) {
    			if (a.TS[0] !== b.TS[0]) {
    				return false;
    			}
    		}
    	}
       
    	return true;
    };
    
    var groupDescriptionTextsByTextStyle = function(descriptionTexts) {
    	var lastTStyle = { }, lastTRStyle = { };
    	var groupedText = [],
    		i = -1;
    	
    	descriptionTexts.forEach(function (descEntry) {
    		var curTStyle = textStyle(descEntry);
    		descEntry.R.forEach(function (textRun) {
    			var curTRStyle = textRunStyle(textRun);
    			if (textStyleMatch(curTStyle, lastTStyle) && textRunStyleMatch(curTRStyle, lastTRStyle)) {
    				groupedText[i] = [groupedText[i], decodeURIComponent(textRun.T).trim()].join(' ');
    			} else {
    				i++;
    				groupedText[i] = decodeURIComponent(textRun.T).trim();
    				lastTStyle = curTStyle;
    				lastTRStyle = curTRStyle;
    			}
    		});
    	});
    	
    	return groupedText;
    };
    
    var parseStatementPeriodText = function (text) {
		var match,
		    statementPeriod = cleanedTextString(text);
			
    	if (match = /(\d+(?:\s+[A-Z][a-z]+(?:\s+\d+)?)?).+(\d+\s+[A-Z][a-z]+\s+\d+)/.exec(statementPeriod)) {
			var end = new Date(match[2]),
				start;
			
			var startDateParts = /(\d+)(\s+[A-Z][a-z]+(\s+\d+)?)?/.exec(match[1]);
			
			if (!startDateParts[2]) {
				start = new Date(end.getFullYear(), end.getMonth(), startDateParts[1]);
			} else {
				start = new Date(match[1]);
				
				if (!startDateParts[3]) {
					start.setFullYear(end.getFullYear());
				}
			}
			
    		var period = {
    			start: start,
    			end: end
    		};
			
    		return period;
		}
		
		return { error: "Cannot parse statement period " + statementPeriod };
	}
	
	var addYearToPartialDate = function(partial, startDate) { 
    	var startYear = +startDate.getFullYear();
    	
    	var fullDate = new Date(partial + " " + startDate.getFullYear());
    	if (fullDate.getMonth() < startDate.getMonth()) {
    		fullDate.setFullYear(startYear + 1);
    	}
    	return fullDate;
    }
     
    var decodeAndTrimString = function (str) {
		return decodeURIComponent(str).trim();
	}
	
	var cleanedTextString = function(text) {
    	return decodeAndTrimString(text.R[0].T);
    };
	
	var cleanAllPagesTextStrings = function (pages) {
		pages.forEach(function (page) {
			page.Texts.forEach(function (text) {
				text.R.forEach(function (textRun) {
					textRun.cleanT = decodeAndTrimString(textRun.T);
				});
			});
		});
	};
    
	var determineStatementVersion = function(statementJson) {
		var firstPage = statementJson.Pages[0];
    	var orderedText = firstPage.Texts.sort(sortByYThenX);
		
		if (cleanedTextString(orderedText[0]) === "Barclays Bank") {
			return 0;
    	}
		
		if (cleanedTextString(orderedText[1]).indexOf("Statement date") === 0) {
			return 1;
    	}
		
		if ((cleanedTextString(orderedText[0]).indexOf("Your statement") === 0) 
				&& (cleanedTextString(orderedText[8]).indexOf("Your accounts at a glance") === 0)){
			return 2;
    	}
		
		return -1;
	};
	
	var initialisePagesForParsing = function (pages) {
		var cloned = clonePages(pages);
		addPageIdToTexts(cloned);
		sortTextPages(cloned);
		sortHLinesInPages(cloned);
		cleanAllPagesTextStrings(cloned);
		return cloned;
	};
	
	return {
		initialisePagesForParsing: initialisePagesForParsing,
		filterTextEntries: filterTextEntries,
		textYPositions: textYPositions,
		lineIsHAlignedWithText: lineIsHAlignedWithText,
		hLineXBounds: hLineXBounds,
		sortByX: sortByX,
		sortByY: sortByY,
		sortByYThenX: sortByYThenX,
		groupDescriptionTextsByTextStyle: groupDescriptionTextsByTextStyle,
		groupHLinesByYAndDeduplicate: groupHLinesByYAndDeduplicate,
		addYearToPartialDate: addYearToPartialDate,
		cleanedTextString: cleanedTextString,
		determineStatementVersion: determineStatementVersion,
		searchForTableHeaders: searchForTableHeaders,
		parseStatementPeriodText: parseStatementPeriodText
	};
})();

module.exports = BSParserUtils;
