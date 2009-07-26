//NSON stringifier / parser
//GPL
//written by Konstantin Welke (2009)

		nson = {
			parseOne: function(s) {
				//parse number, followed by either %{["
				var number_start = s.search(/\d/);
				var type_pos = s.search(/[%\{\[\"]/);
				//XXX: check that number_start is before type_pos?
				var number = s.substring(number_start, type_pos);
				number = parseInt(number);
	
				if (isNaN(number))
					throw "does not start with length specifier";

				var type = s.substr(type_pos, 1);
				var payload = s.substr(type_pos+1, number);

				var rest_start = type_pos+1+number;
				var rest = s.substr(rest_start);
				//rest starts with whitespace and type delimiter
				var has_closing = /\s*[%\}\]\"]/.test(rest);
				if (!has_closing)
					throw "expected closing delimiter";
				var closing_pos = rest.search(/[%\}\]\"]/);
				//check that the ending is correct
				var closing_type = rest.substr(closing_pos, 1);
				var matching_type = {"{": "}", "[": "]", "\"": "\"", "%": "%"};
				if (closing_type != matching_type[type])
					throw "inconsistent type: starts with " + type + " but ends with " + closing_type;

				var total_length = rest_start + closing_pos+1;
				
				/* looking for commas should be done elsewhere 
				var rest2 = s.substr(total_length);
				var has_comma = /\s*,/.test(rest2);
				if (has_comma) {
					var comma_pos = rest2.search(/,/);
					total_length += comma_pos+1;
				}
				*/

				/*
				alert("length: " + number
							+ ", type: " + type
							+ ", payload: " + payload
							+ ", has_comma: " + has_comma
							+ ", rest: '" + s.substr(total_length) + "'");
				*/

				switch(type) {
					case "%":
						return [Number(payload), total_length];

					case "{":
						return [this.parseObjectPayload(payload), total_length];

					case "[":
						return [this.parse(payload), total_length];

					case '"':
						return [payload, total_length];

					default:
						throw "unknown type specifier '" + type + "'";
				}
			},

			eatTrailingComma: function(s) {
				var comma = /\s*,/;
				if (s.search(comma) == 0)
					return s.substr(s.match(comma)[0].length);
				return s;
			},

			parseObjectPayload: function(s) {
				var ret = {};

				while (s.search(/\s*\d/) == 0) {
					var one = this.parseOne(s, '"');
					var key = one[0];
					s = s.substr(one[1]);
					//either terminated by , or :
					var has_delimiter = (s.search(/\s*[,:]/) == 0);
					if (!has_delimiter)
						//parsed all payload or errorneous payload
						break;
					var delimiter_ws = s.match(/\s*[,:]/)[0];
					var delimiter = delimiter_ws.substr(-1,1);
					s = s.substr(delimiter_ws.length);
					if ("," == delimiter) {
						ret[key] = true;
					} else {
						//delimiter must be ':' ?
						one = this.parseOne(s);
						s = s.substr(one[1]);
						ret[key] = one[0];
					}
					s = nson.eatTrailingComma(s);
				}
				
				return ret;
			},

			parse: function(s) {
				var ret = [];

				while(s.search(/\s*\d/) == 0) {
					var one = this.parseOne(s);
					ret.push(one[0]);
					s = s.substr(one[1]);
					s = nson.eatTrailingComma(s);
				}

				return ret;
			},
	
			stringify: function(o, pretty, ind) {
				if (!ind)
					ind = 0;

				function cut2(s) {
					//cuts last 2 characters from string
					return s.substr(0, s.length-2);
				}
				function s(ind) {
					//returns ind spaces
					var s = "";
					for(var i = 0; i < ind; ++i)
						s += " ";
					return s;
				}
	
				//TODO: Date!
				if (typeof(o) == "number") {
					var s = String(o);
					return s.length + '%' + s + '%, ';
				} else if (typeof(o) == "string") {
					return o.length + '"' + o + '", ';
				} else if (o instanceof Array) {
					var inside = "";
					for(var i = 0; i < o.length; ++i)
						inside += nson.stringify(o[i], pretty, ind+2);
					return (inside.length-2) + "[" + cut2(inside) + "], ";
				} else { //Object...
					var inside = "";
					for(i in o) 
						inside += cut2(nson.stringify(i), pretty, ind+2) + ": "
							+ cut2(nson.stringify(o[i]), pretty, ind+2) + ", ";
					return (inside.length-2) + "{" + cut2(inside) + "}, ";
				}
			}
		};