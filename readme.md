# barclaysStatement2json

barclaysStatement2json is a [node.js](http://nodejs.org/) module that parses and converts Barclays Bank PDF from binary to json format. It's built using [pdf2json](https://github.com/modesty/pdf2json/) to parse the pdf document, then processes the result to get the statement data.

With the exception of the statement parsing logic, the code (with some light modification) is from [pdf2json](https://github.com/modesty/pdf2json/).

**This code and the author are in no way affiliated with Barclays Bank.**

This code was created because online banking only holds transactions in a nice format for a small period, but the data is held in pdf statements for much longer.

## Usage
You'll need nodejs installed, this code downloaded and some PDF format Barclays Bank statements somewhere in local storage. Then:

	node <path to code>\barclaysStatement2json.js -f <path to folder containing statements> -o <path to put the resulting JSON files>

## Usage with mongodb
Personally I wanted to query against the transactions from the statements and decided to do that from a mongodb. By adding -tM to the flags above the exported JSON will be arrays of transactions with mongoimport-able dates (v2.4).

To import the JSON to mongodb (from Windows) I wrote mongoimportMultiple.bat for importing multiple files then ran:

	<path to code>\mongoimportMultiple.bat <path of JSON files> -d <target mongodb> -c <target collection> --jsonArray

Finally, having imported to a 'transactions' collection in my 'financedb', to get the data I wanted I grouped all transactions by who they were made to, summing the total paid over the last tax year by running the following in the mongo console:

	use financedb;

	db.runCommand({ 
		mapreduce: "transactions", 
		map : function Map() {
				emit(this.to, { count: 1, amount: this.moneyOut, date: this.date  });
			},
		reduce : function Reduce(key, values) {
				var reduced = { count: 0, amount: 0, transactions: [] }
				values.forEach(function(val) {
					reduced.count += val.count;
					reduced.amount += +(val.amount);
					if (val.date) {
						reduced.transactions.push({ date: val.date, amount: val.amount });
					} else {
						reduced.transactions = reduced.transactions.concat(val.transactions);
					}
				});
				return reduced;
			},
		finalize : function Finalize(key, reduced) {
			return reduced;
		},
		query : { "$and" : [{ "to" : { "$exists" : true } }, { "date" : { "$gte" : ISODate("2013-04-06T00:00:00Z"), "$lt" : ISODate("2014-04-06T00:00:00Z") } }] },
		out : { replace: "groupedTransactionsTaxYearTo2014" , db: "financedb"  }
	});
