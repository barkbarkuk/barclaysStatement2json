'use strict';
// This file is an almost exact copy of p2jcmd.js, distributed with https://github.com/modesty/pdf2json, with small modifications from me (https://github.com/barkbarkuk)

var fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    StatementParser = require("../statementparser"),
    pkInfo = require('../package.json'),
    nodeUtil = require("util"),
    async = require("async"),
    dir = require("node-dir");

var optimist = require('optimist')
    .usage('\nUsage: $0 -f|--file [-o|output_dir]')
    .alias('v', 'version')
    .describe('v', 'Display version.\n')
    .alias('h', 'help')
    .describe('h', 'Display brief help information.\n')
    .alias('f', 'file')
    .describe('f', '(required) Full path of input Barclays PDF statement file or a directory to scan for all PDF files. When specifying a PDF file name, it must end with .PDF, otherwise it would be treated as a input directory.\n')
    .alias('r', 'recurse')
    .describe('r', '(optional) If directory specified recurse folder structure to find PDFs\n')
    .alias('o', 'output_dir')
    .describe('o', '(optional) Full path of output directory, must already exist. Current JSON file in the output folder will be replaced when file name is same.\n')
    .alias('s', 'silent')
    .describe('s', '(optional) when specified, will only log errors, otherwise verbose.\n')
	.alias('t', 'transactions')
	.describe('t', '(optional) when specified, only outputs parsed transactions to JSON in an array')
	.alias('M', 'mongodates')
	.describe('M', '(optional) when specified, outputs dates for inputting with mongoimport');

var argv = optimist.argv;

var PDFProcessor = (function () {
    var _PRO_TIMER = pkInfo._id  + " - " + pkInfo.homepage;

    // constructor
    var cls = function () {
        this.inputCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.warningCount = 0;

        this.inputs = [];
        this.failures = [];
        this.successes = [];

        this.options = {};

        this.p2j = null;
    };

    var processInputOptions = function (options) {
        // Input options
        if (!_.has(options, 'f')) {
            //optimist.showHelp();
            console.log("-f is required to specify input directory or file.");
            return false;
        }

        var processedOptions = {
            path: options.f,
            pathStat: fs.statSync(options.f),
            recurse: _.has(options, 'r')
        }

        if (!(processedOptions.pathStat.isFile() || processedOptions.pathStat.isDirectory())) {
            console.log("-f specified but is not a valid file or directory");
            return false;
        }

        return processedOptions;
    }

    var processOutputOptions = function (options) {
        var processedOptions = {
            path: options.o,
            useMongoDates: _.has(options, 'M'),
            transactionsOnly: _.has(options, 't')
        };

        if (processedOptions.path) {
            var pathStat = fs.statSync(processedOptions.path);
            if (!pathStat.isDirectory()) {
                console.log("-o specified but is not a valid output directory");
                return false;
            }
            processedOptions.pathStat = pathStat;
        }

        return processedOptions;
    }

    // Check that a file/folder is specified on the command line and neither the version or help flags are set
    cls.prototype.initialize = function(){
        console.time(_PRO_TIMER);
        var retVal = true;
        try {
            if (_.has(argv, 'v')) {
                console.log(pkInfo.version);
                return false;
            }

            if (_.has(argv, 'h')) {
                optimist.showHelp();
                return false;
            }

            var inputOptions = processInputOptions(argv);
            var outputOptions = processOutputOptions(argv);

            if (!inputOptions || !outputOptions) {
                optimist.showHelp();
                return false;
            }
            
            if (!outputOptions.path) {
                outputOptions.path = path.dirname(inputOptions.path);
                outputOptions.pathStat = fs.statSync(outputOptions.path);
            }

            this.options.input = inputOptions;
            this.options.output = outputOptions;
        }
        catch(e) {
            console.log("Exception: " + e.message);
            retVal = false;
        }
        return retVal;
    };

    cls.prototype._recordSuccess = function(sourcePath, destinationPath) {
        this.inputCount++;
        this.successCount++;
        this.successes.push({ sourcePath: sourcePath, destinationPath: destinationPath});
        console.log("Converted '" + sourcePath + "' to '" + destinationPath + "'");
        this.fileProcessingComplete();
    }

    cls.prototype._recordFailure = function(sourcePath, errType, err) {
        this.inputCount++;
        this.failedCount++;
        this.failures.push({ path: sourcePath, err: { type: errType, err: err }});
        console.log("Failed in conversion of '" + sourcePath + "'");
        this.fileProcessingComplete();
    };

    cls.prototype.start = function(){
        var self = this;
        if (!this.initialize()) {
            console.timeEnd(_PRO_TIMER);
            return;
        }

        console.log("\n" + pkInfo._id + " - " + pkInfo.homepage);

        try {
            if (this.options.input.pathStat.isFile()) {
                fs.readFile(this.options.input.path, function (err, data) {
                    self.process(self.options.input.path, data);
                });
            }
            else {  // We have already established the input is a file or a directory
                dir.readFiles(this.options.input.path, 
                                {match: /\.pdf$/, recursive: this.options.input.recurse, encoding: null}, 
                                function(err, data, filename, next) {
                    if (err) {
                        console.log("Error reading " + filename, err.data);
                        self._recordFailure(filename, 'readError', err);
                    } else {
                        console.log("Read " + filename + ", processing...");
                        self.process(filename, data);
                    }
                    next();
                // }, this.complete.bind(this));
                });
            }
        }
        catch(e) {
            console.log("Exception: " + e.message);
            console.timeEnd(_PRO_TIMER);
        }
    };

    cls.prototype.fileProcessingComplete = function () {
        console.log("File processing complete (inputs: " + this.inputs.length + 
            "; successes: " + this.successes.length + "; failures: " + this.failures.length + ")")
        if (this.inputs.length === (this.successes.length + this.failures.length)) {
            this.complete();
        }
    };

    cls.prototype.complete = function() {
        var statusMsg = "\n%d input files\t%d success\t%d fail\t%d warning.";
        console.log(statusMsg, this.inputCount, this.successCount, this.failedCount, this.warningCount);
        console.log("Failures:" + this.failures.length)
        this.failures.forEach(function (failure) {
            console.log(failure.path + ": " + failure.err.type);
        });

        process.nextTick( function() {
            console.timeEnd(_PRO_TIMER);
            var exitCode = (this.inputCount === this.successCount) ? 0 : 1;
            process.exit(exitCode);
        }.bind(this));
    };

    var _parseBuffer = function(data, context, callback) {
        var pdfParser = new StatementParser(context);

        pdfParser.setVerbosity(1);

        pdfParser.on("bsParser_dataReady", function (evtData) {
            if ((!!evtData) && (!!evtData.data)) {
                callback(null, evtData);
            }
            else {
                callback("Empty parsing result", evtData);
            }
        });

        pdfParser.on("bsParser_dataError", function (evtData) {
            console.log("ERRORERRORERRORERRORERRORERRORERRORERRORERRORERRORERRORERRORERRORERRORERROR")
            callback(evtData, null);
        });

        pdfParser.parseBuffer(data);  
    };

    var _processResult = function (sourcePath, result, options, callback) {
        var stringifyReplacer, pJSON,
            data = result.data;

        //console.log("Result: ", data)

        var outputPath = path.normalize(options.path + path.sep + path.basename(sourcePath, '.pdf') + '.json');
        if (options.useMongoDates) {
            stringifyReplacer = function (key, value) {
                if (this[key] instanceof Date) {
                    // Note: This outputs dates for import with mongoimport v2.4
                    return { "$date": this[key].valueOf() };
                }
                return value;
            }
        }
        
        try {
            if (options.transactionsOnly) {
                pJSON = JSON.stringify(data.transactions, stringifyReplacer, 2);
            } else {
                pJSON = JSON.stringify({"meta":data.meta, "transactions":data.transactions}, stringifyReplacer, 2);
            }
        } catch (err) {
            console.log("Fail stringifying " + outputPath, err);
            callback("Error stringifying result", outputPath);
        }

        fs.writeFile(outputPath, pJSON, function (err) {
            if (err) {
                callback(err, outputPath);
                return;
            }
            callback(null, outputPath);
        });
        
    };

    cls.prototype.process = function (sourcePath, data) {
        var self = this;
        var context = { sourcePath: sourcePath };
        this.inputs.push(sourcePath);
        _parseBuffer(data, context, function (err, result) {
            if (err) {
                console.log("Error parsing " + sourcePath + "\n", err);
                self._recordFailure(sourcePath, 'parseError', err);
                return;
            }

            _processResult(sourcePath, result, self.options.output, function (saveErr, destinationPath) {
                if (saveErr) {
                    self._recordFailure(sourcePath, 'saveErr', saveErr);
                    return;
                }
                self._recordSuccess(sourcePath, destinationPath);
            });
            
        });
    }

    return cls;
})();

module.exports = PDFProcessor;
