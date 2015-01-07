'use strict';
// This file is an almost exact copy of p2jcmd.js, distributed with https://github.com/modesty/pdf2json, with small modifications from me (https://github.com/barkbarkuk)

var fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    PDFParser = require("../statementparser"),
    pkInfo = require('../package.json'),
    nodeUtil = require("util"),
    async = require("async");

var optimist = require('optimist')
    .usage('\nUsage: $0 -f|--file [-o|output_dir]')
    .alias('v', 'version')
    .describe('v', 'Display version.\n')
    .alias('h', 'help')
    .describe('h', 'Display brief help information.\n')
    .alias('f', 'file')
    .describe('f', '(required) Full path of input Barclays PDF statement file or a directory to scan for all PDF files. When specifying a PDF file name, it must end with .PDF, otherwise it would be treated as a input directory.\n')
    .alias('o', 'output_dir')
    .describe('o', '(optional) Full path of output directory, must already exist. Current JSON file in the output folder will be replaced when file name is same.\n')
    .alias('s', 'silent')
    .describe('s', '(optional) when specified, will only log errors, otherwise verbose.\n')
	.alias('t', 'transactions')
	.describe('t', '(optional) when specified, only outputs parsed transactions to JSON in an array')
	.alias('M', 'mongodates')
	.describe('M', '(optional) when specified, outputs dates for inputting with mongoimport');

var argv = optimist.argv;

var BS2JSONUtil = (function () {

    var _continue = function(callback, err) {
        if (err)
            nodeUtil.p2jwarn(err);
        if (_.isFunction(callback))
            callback(err);
    };

    var _writeOneJSON = function(data, callback) {
		var pJSON;

		var stringifyReplacer;
		if (_.has(argv, 'M')) {
			stringifyReplacer = function (key, value) {
				if (this[key] instanceof Date) {
					// Note: This outputs dates for import with mongoimport v2.4
					return { "$date": this[key].valueOf() };
				}
				return value;
			}
		}
		
		if (_.has(argv, 't')) {
			pJSON = JSON.stringify(data.transactions, stringifyReplacer, 2);
		} else {
			pJSON = JSON.stringify({"meta":data.meta, "transactions":data.transactions}, stringifyReplacer, 2);
		}

        fs.writeFile(this.outputPath, pJSON, function(err) {
            if(err) {
                nodeUtil.p2jwarn(this.inputFile + " => " + this.outputFile + " Exception: " + err);
                this.curProcessor.failedCount++;
            } else {
                nodeUtil.p2jinfo(this.inputFile + " => " + this.outputFile + " [" + this.outputDir + "] OK");
                this.curProcessor.successCount++;
            }
            callback(err, this.outputFile);
        }.bind(this));
    };

    var _parseOnePDF = function(callback) {
        var self = this;
        this.pdfParser = new PDFParser(null);

        this.pdfParser.on("bsParser_dataReady", function (evtData) {
            if ((!!evtData) && (!!evtData.data)) {

                var outputTasks = [function(cbFunc) { _writeOneJSON.call(self, evtData.data, cbFunc);}];

                async.series(outputTasks, function(err, results){
                    if (err) {
                        nodeUtil.p2jwarn("Error: " + err);
                    } else {
                        nodeUtil.p2jinfo("Output files OK", results);
                    }

                    _continue.call(self, callback);
                });
            }
            else {
                this.curProcessor.failedCount++;
                _continue.call(this, callback, "Exception: empty parsing result - " + this.inputPath);
            }
        }.bind(this));

        this.pdfParser.on("bsParser_dataError", function (evtData) {
            this.curProcessor.failedCount++;
            var errMsg = "Exception: " + evtData.data;
            _continue.call(this, callback, errMsg);
        }.bind(this));

        nodeUtil.p2jinfo("Transcoding " + this.inputFile + " to - " + this.outputPath);
        this.pdfParser.loadPDF(this.inputPath, (_.has(argv, 's') ? 0 : 5));
    };

    // constructor
    var cls = function (inputDir, inputFile, curProcessor) {
        // public, this instance copies
        this.inputDir = path.normalize(inputDir);
        this.inputFile = inputFile;
        this.inputPath = this.inputDir + path.sep + this.inputFile;

        this.outputDir = path.normalize(argv.o || inputDir);
        this.outputFile = null;
        this.outputPath = null;

        this.pdfParser = null;
        this.curProcessor = curProcessor;
    };

    cls.prototype.validateParams = function() {
        var retVal = null;

        if (!fs.existsSync(this.inputDir))
            retVal = "Input error: input directory doesn't exist - " + this.inputDir + ".";
        else if (!fs.existsSync(this.inputPath))
            retVal = "Input error: input file doesn't exist - " + this.inputPath + ".";
        else if (!fs.existsSync(this.outputDir))
            retVal = "Input error: output directory doesn't exist - " + this.outputDir + ".";

        if (retVal != null) {
            this.curProcessor.failedCount += 1;
            return retVal;
        }

        var inExtName = path.extname(this.inputFile).toLowerCase();
        if (inExtName !== '.pdf')
            retVal = "Input error: input file name doesn't have pdf extention  - " + this.inputFile + ".";
        else {
            this.outputFile = path.basename(this.inputPath, inExtName) + ".json";
            this.outputPath = this.outputDir + path.sep + this.outputFile;
            if (fs.existsSync(this.outputPath))
                nodeUtil.p2jinfo("Output file will be replaced - " + this.outputPath);
            else {
                var fod = fs.openSync(this.outputPath, "wx");
                if (!fod)
                    retVal = "Input error: can not write to " + this.outputPath;
                else {
                    fs.closeSync(fod);
                    fs.unlinkSync(this.outputPath);
                }
            }
        }

        return retVal;
    };

    cls.prototype.destroy = function() {
        this.inputDir = null;
        this.inputFile = null;
        this.inputPath = null;
        this.outputDir = null;
        this.outputPath = null;

        if (this.pdfParser) {
            this.pdfParser.destroy();
        }
        this.pdfParser = null;
        this.curProcessor = null;
    };

    cls.prototype.processFile = function(callback) {
        var validateMsg = this.validateParams();
        if (!!validateMsg) {
            _continue.call(this, callback, validateMsg);
        }
        else {
            _parseOnePDF.call(this, callback);
        }
    };

    return cls;
})();

var PDFProcessor = (function () {
    var _PRO_TIMER = pkInfo._id  + " - " + pkInfo.homepage;

    // constructor
    var cls = function () {
        this.inputCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.warningCount = 0;

        this.p2j = null;
    };

    cls.prototype.initialize = function(){
        console.time(_PRO_TIMER);
        var retVal = true;
        try {
            if (_.has(argv, 'v')) {
                console.log(pkInfo.version);
                retVal = false;
            }
            else if (_.has(argv, 'h')) {
                optimist.showHelp();
                retVal = false;
            }
            else if (!_.has(argv, 'f')) {
                optimist.showHelp();
                console.log("-f is required to specify input directory or file.");
                retVal = false;
            }
        }
        catch(e) {
            console.log("Exception: " + e.message);
            retVal = false;
        }
        return retVal;
    };

    cls.prototype.start = function(){
        if (!this.initialize()) {
            console.timeEnd(_PRO_TIMER);
            return;
        }

        try {
            console.log("\n" + pkInfo._id + " - " + pkInfo.homepage);

            var inputStatus = fs.statSync(argv.f);

            if (inputStatus.isFile()) {
                this.processOneFile();
            }
            else if (inputStatus.isDirectory()) {
                this.processOneDirectory();
            }
        }
        catch(e) {
            console.log("Exception: " + e.message);
            console.timeEnd(_PRO_TIMER);
        }
    };

    cls.prototype.complete = function(err) {
        var statusMsg = "\n%d input files\t%d success\t%d fail\t%d warning.";
        console.log(statusMsg, this.inputCount, this.successCount, this.failedCount, this.warningCount);

        process.nextTick( function() {
            console.timeEnd(_PRO_TIMER);
            var exitCode = (this.inputCount === this.successCount) ? 0 : 1;
            process.exit(exitCode);
        }.bind(this));
    };

    cls.prototype.processOneFile = function () {
        var inputDir = path.dirname(argv.f);
        var inputFile = path.basename(argv.f);

        this.inputCount = 1;
        this.p2j = new BS2JSONUtil(inputDir, inputFile, this);
        this.p2j.processFile(_.bind(this.complete, this));
    };

    cls.prototype.processFiles = function(inputDir, files) {
        var fId = 0;
        this.p2j = new BS2JSONUtil(inputDir, files[fId], this);
        this.p2j.processFile( function processPDFFile(err) {
            if (err) {
                this.complete(err);
            }
            else {
                fId++;
                if (fId >= this.inputCount) {
                    this.complete(null);
                }
                else {
                    if (this.p2j) {
                        this.p2j.destroy();
                        this.p2j = null;
                    }

                    this.p2j = new BS2JSONUtil(inputDir, files[fId], this);
                    this.p2j.processFile(processPDFFile.bind(this));
                }
            }
        }.bind(this));
    };

    cls.prototype.processOneDirectory = function () {
        var inputDir = path.normalize(argv.f);

        fs.readdir(inputDir, function(err, files) {
            var _iChars = "!@#$%^&*()+=[]\\\';,/{}|\":<>?~`.-_  ";
            var pdfFiles = files.filter(function(file) {
                return file.substr(-4).toLowerCase() === '.pdf' && _iChars.indexOf(file.substr(0,1)) < 0;
            });

            this.inputCount = pdfFiles.length;
            if (this.inputCount > 0) {
                this.processFiles(inputDir, pdfFiles);
            }
            else {
                console.log("No PDF files found. [" + inputDir + "].");
                this.complete(null);
            }
        }.bind(this));
    };

    return cls;
})();

module.exports = PDFProcessor;
