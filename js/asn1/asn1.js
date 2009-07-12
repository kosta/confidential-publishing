//Konstantin Welke, 2008-11-23
//Licensed under the GPLv2 and GPLv3.
//reads the subset of ASN.1 thats needed to parse an openssl rsa private key
//todo: can it also parse an openssl public key?

ASN1 = {

	object_identifiers: {"\u002A\u0086\u0048\u0086\u00F7\u000D\u0001\u0001\u0001": "rsaEncryption" },
	name_to_object_identifiers: {"rsaEncryption": "\u002A\u0086\u0048\u0086\u00F7\u000D\u0001\u0001\u0001"},

	parse: function(input, fieldnames, morenames) {
		if (morenames == undefined)
			morenames = "unknown";
		var state = {fieldnames: fieldnames,
                 morenames: morenames,
                 name_i: 0,
                 ret: {} };
		return ASN1.parse_state(input, state, 0, input.length);
	},

	//assumes "input" is a (binary) octet string of ASN.1 data
	//note that "input" is actually a string of 16-bit data, but lets forget about that... :)
	parse_state: function(input, /*state*/ s, start, end) {
		while (start < end) {
			var type = input.charCodeAt(start++);
			var length = ASN1.length(input, start);
			start += length.length_of_length;
		
			switch(type) {
					case 0x03:
					//BIT STRING
					//this part i dont understand
					start += 1; 
					length.length -= 1;
					//no break, because we treat it like a sequence
				case 0x30:
					//SEQUENCE
					s.ret = ASN1.parse_state(input, s, start, start+length.length);
					break;
				case 0x06:
					//OBJECT IDENTIFIER
					s.ret[s.fieldnames[s.name_i++]] = ASN1.object_identifiers[input.substr(start, length.length)];
					break;
				case 0x05:
					//NULL
					s.ret[s.fieldnames[s.name_i++]] = undefined;
					break;
				case 0x02:
					//INTEGER
					s.ret[s.fieldnames[s.name_i++]] = input.substr(start, length.length);
					break;
				default:
					throw "Unknown field: 0x" + type.toString(16);
					break;
			}

			start += length.length;
		}

		return s.ret;
	},

	length: function(input, pos) {
		if (input.charCodeAt(pos) > 127) {
			//most significant bit is set
			//->multi-byte input length
			//->7 least significant bytes will how many bytes
			var length_of_length = input.charCodeAt(pos) & 0x7F;
			var length = 0;
			//this obviously crashes for big inputs...
			for(var i = pos+1; i < pos+1+length_of_length; ++i)
				length = (length << 8) | input.charCodeAt(i);
			return {length: length, length_of_length: length_of_length+1};
		}
		//most significant bit not set
		//this byte denotes the input length
		return {length: input.charCodeAt(pos), length_of_length: 1};
	},

	int_to_js_int: function(asn1_int) {
		/* todo: doenst check if string is too long */
		var ret = 0;
		var n = asn1_int.length;
		for(var i = 0; i < n; ++i)
			ret |= asn1_int.charCodeAt(i) << ((n-i-1)*8);
		return ret;
	},

	length_of_integer: function(int) {
		//expects javascript number
		//returns length in octets
		var length_of_length = 0;
		while (int && (length_of_length < 128) ) {
				int >>>= 8;
				++length_of_length;
			}
		//todo: is this a off-by one?
		return (length_of_length ? length_of_length : 1);
	},

	toLength: function(length) {
		//expects javascript number
		if (length > 127) {
			var length_of_length = ASN1.length_of_integer(length);
			var ret = String.fromCharCode(0x80 | length_of_length);
			for(var i = length_of_length-1; i >= 0; --i) {
				ret += String.fromCharCode((length >>> (8*i)) & 0xFF);
			}
			return ret;
		}
		return String.fromCharCode(length);
	},

	toInteger: function(int) {
		//expects either a javascript number or a BigInteger (Tom Wu style)
		//note the JavaScript subtle differences between typeof and instanceof...
		//start with integer charcode
		var ret = String.fromCharCode(0x02);
		if (typeof(int) == "number") {
			var length = ASN1.length_of_integer(int);
			ret += ASN1.toLength(length);
			for(var i = length-1; i >= 0; --i)
				ret += String.fromCharCode((int >>> (8*i)) & 0xFF);
			return ret;
		} else if (int instanceof BigInteger) {
			var s = int.toString(256);
      //hack: make string length uneven
      if (s.length % 2 == 0)
        s = String.fromCharCode(0) + s;
			ret += ASN1.toLength(s.length) + s;
			return ret;
		}
		else
			throw "unknown type (" + int + "): " + typeof(int);
	},

	toSequence: function() {
		//expects ASN.1 octet strings
		var ret = String.fromCharCode(0x30); //SEQUENCE bitfield
		var content_length = 0;
		for(var arg = 0; arg < arguments.length; ++arg)
			content_length += arguments[arg].length;
		ret += ASN1.toLength(content_length);
		for(var arg = 0; arg < arguments.length; ++arg)
			ret += arguments[arg];
		return ret;
	},

	Null: String.fromCharCode(0x05, 0x00),

	toBitString: function() {
		//expects ASN.1 octet strings
		var ret = String.fromCharCode(0x03); //BITSTRING bitfield
		var content_length = 1;
		for(var arg = 0; arg < arguments.length; ++arg)
			content_length += arguments[arg].length;
		ret += ASN1.toLength(content_length);
    ret += String.fromCharCode(0x00); //dont ask cause I dont know
		for(var arg = 0; arg < arguments.length; ++arg)
			ret += arguments[arg];
		return ret;
	},

	toObjectIdentifier: function(id) {
		var asn1_obj_id = ASN1.name_to_object_identifiers[id];
		if (asn1_obj_id == undefined)
			throw "unknown ASN.1 Object ID: " + id;
		return String.fromCharCode(0x06) //OBJECT IDENTIFIER
			+ ASN1.toLength(asn1_obj_id.length)
			+ asn1_obj_id;
	}
};

/* Konstantin Welke, requires Tom Wu's BigInteger & RSA library */
RSAKey.new_key_from_openssl = function(input) {
  if (input.match(/-----BEGIN RSA PRIVATE KEY-----/))
    return RSAKey.new_private_key_from_openssl(input);
  else
    return RSAKey.new_public_key_from_openssl(input);
}

RSAKey.new_private_key_from_openssl = function(input) {
	input = input.
			replace(/-----BEGIN RSA PRIVATE KEY-----/, "").
			replace(/-----END RSA PRIVATE KEY-----/, "");
	var o = ASN1.parse(Base64.decode(input), 
	                  ["version", "modulus", "e", 
                     "private_exponent", "prime1", "prime2", 
                     "exponent1", "exponent2", "coefficient"]);
	var key = new RSAKey();
  key.n = parseBigInt(o.modulus, 256);
  key.e = ASN1.int_to_js_int(o.e)
  key.d = parseBigInt(o.private_exponent,256);
	key.p = parseBigInt(o.prime1, 256);
	key.q = parseBigInt(o.prime2, 256);
	key.dmp1 = parseBigInt(o.exponent1, 256);	
	key.dmq1 = parseBigInt(o.exponent2, 256);
	key.coeff = parseBigInt(o.coefficient, 256);
	key.private = true;
	return key;
};

RSAKey.new_public_key_from_openssl = function(input) {
  input = input.
      replace(/-----BEGIN PUBLIC KEY-----/, "").
      replace(/-----END PUBLIC KEY-----/, "");
	var o = ASN1.parse(Base64.decode(input), ["algorithm", "null", "modulus", "exponent"]);
	var key = new RSAKey();
	key.n = parseBigInt(o.modulus, 256);
	key.e = ASN1.int_to_js_int(o.exponent)
	return key;
};

RSAKey.prototype.to_public_key_asn1 = function() {
  return ASN1.toSequence(
    ASN1.toSequence(
      ASN1.toObjectIdentifier("rsaEncryption"),
      ASN1.Null),
    ASN1.toBitString(
        ASN1.toSequence(
          ASN1.toInteger(this.n),
          ASN1.toInteger(this.e)
    )));
}

RSAKey.prototype.to_asn1 = function() {
	if (this.private)
		return ASN1.toSequence(
			ASN1.toInteger(0), //version
			ASN1.toInteger(this.n),
			ASN1.toInteger(this.e),
			ASN1.toInteger(this.d), //private exponent
			ASN1.toInteger(this.p),
			ASN1.toInteger(this.q),
			ASN1.toInteger(this.dmp1),
			ASN1.toInteger(this.dmq1),
			ASN1.toInteger(this.coeff)
		);
	else //public key
		return this.to_public_key_asn1();
};

RSAKey.prototype.to_openssl = function() {
	var s;
	if (this.private)
		s = "-----BEGIN RSA PRIVATE KEY-----\n";
	else
		s = "-----BEGIN PUBLIC KEY-----\n";

	s += Base64.encode(this.to_asn1());

	//debug
	for(var i = 0; i < s.length; ++i)
		if (s.charCodeAt(i) > 0xFF)
			throw i;

	if (this.private)
		s += "\n-----END RSA PRIVATE KEY-----\n";
	else
		s += "\n-----END PUBLIC KEY-----\n";

	return s;
};

RSAKey.prototype.to_openssl_public_key = function() {
  return "-----BEGIN PUBLIC KEY-----\n"
    + Base64.encode(this.to_public_key_asn1())
    + "\n-----END PUBLIC KEY-----\n";
}