// This file is an almost exact copy of pdfparser.js, distributed with https://github.com/modesty/pdf2json, with small modifications from me (https://github.com/barkbarkuk)
var PDFJS = require("pdf2json/lib/pdf.js"),
	nodeUtil = require("util"),
    nodeEvents = require("events"),
	_ = require('underscore'),
	bsParser = require("./lib/bsParser.js"),
	bsParserUtils = require("./lib/bsParserUtils.js");

var StatementParser = (function () {
	'use strict';
    // private static
    var _nextId = 1;
    var _name = 'BSParser';

    var _binBuffer = {};
    var _maxBinBufferCount = 10;
	
	// constructor
	var cls = function (context) {
		//call constructor for super class
		nodeEvents.EventEmitter.call(this);
        
		// private
        var _id = _nextId++;

        // public (every instance will have their own copy of these methods, needs to be lightweight)
        this.get_id = function() { return _id; };
        this.get_name = function() { return _name + _id; };

        // service context object
        this.context = context;

        this.data = null; //if file read success, data is PDF content; if failed, data is "err" object
        
		this.PDFJS = new PDFJS(false);
        this.parsePropCount = 0;
	}
    // inherit from event emitter
	nodeUtil.inherits(cls, nodeEvents.EventEmitter);
	
    // public static
    cls.get_nextId = function () {
        return _name + _nextId;
    };

    //private methods, needs to invoked by [funcName].call(this, ...)
    var parse = function (data) {
    	var pages = data.Pages;
		
		if (!pages) {
			return { error: "No pages in parsed PDF" };
		}
		
		pages = bsParserUtils.initialisePagesForParsing(pages);
		
		return bsParser.parse(data);
	}
	
    var _onPDFJSParseDataReady = function(data) {
		if (this.parsePropCount < 1) {
			_.extend(this.data, data);
		}
		this.parsePropCount++;
//	    console.log("Partially parsed PDF content? ", this.context, this.parsePropCount)
        if (this.parsePropCount >= 2) {
            // console.log("Parsed PDF content, now parsing statement. ", this.context)
            var bsStatement;
            try {
                bsStatement = parse(data);           // This is where we transition from PDF parsing to statement parsing
            } catch (error) {
                if (!bsStatement) {
                    bsStatement = {};
                }
                bsStatement.error = error;
            }

			if (bsStatement.error) {
				this.data = bsStatement.error;
				this.emit("bsParser_dataError", this);		
			} else {
				_.extend(this.data, bsStatement);
				this.emit("bsParser_dataReady", this);
				nodeUtil.p2jinfo("Statement parsing completed.");
			}
        }
    };

    var _onPDFJSParserDataError = function(data) {
        this.data = data;
        console.log("Error parsing PDF content", this.context)
        this.emit("bsParser_dataError", this);
    };

    var startParsingPDF = function(buffer) {
        this.data = {};
        this.parsePropCount = 0;
		
        this.PDFJS.on("pdfjs_parseDataReady", _.bind(_onPDFJSParseDataReady, this));
        this.PDFJS.on("pdfjs_parseDataError", _.bind(_onPDFJSParserDataError, this));

        this.PDFJS.parsePDFData(buffer);
    };
	 
    // public (every instance will share the same method, but has no access to private fields defined in constructor)	
    cls.prototype.destroy = function() {
        this.removeAllListeners();

        if (this.context) {
            this.context.destroy();
            this.context = null;
        }

        this.data = null;

        this.PDFJS.destroy();
        this.PDFJS = null;

        this.parsePropCount = 0;
    };

    cls.prototype.setVerbosity = function(verbosity) {
        nodeUtil.verbosity(verbosity);
    }

    cls.prototype.parseBuffer = function (pdfBuffer) {
        startParsingPDF.call(this, pdfBuffer);
    };
	
    return cls;	
})();

module.exports = StatementParser;
