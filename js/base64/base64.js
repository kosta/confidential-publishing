// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com
// note: this seems almost identical to http://www.webtoolkit.info/javascript-base64.html
// modified by Konstantin Welke (encapsulated in a class, handle empty string, en/decode16)

Base64 = {
	keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
	decodeStr: {A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, 
							K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, 
							T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25, a: 26, b: 27,
							c: 28, d: 29, e: 30, f: 31, g: 32, h: 33, i: 34, j: 35, k: 36, 
							l: 37, m: 38, n: 39, o: 40, p: 41, q: 42, r: 43, s: 44, t: 45,
							u: 46, v: 47, w: 48, x: 49, y: 50, z: 51, 0: 52, 1: 53, 2: 54,
							3: 55, 4: 56, 5: 57, 6: 58, 7: 59, 8: 60, 9: 61, "+": 62, 
							"/": 63, "=": 64, "": 64},
	
	encode: function(input, options) {
    options = options || {};
    options.breakchar = options.breakchar || "\n";
    var o = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

    while (i < input.length) {
      chr1 = input.charCodeAt(i++);
      chr2 = input.charCodeAt(i++);
      chr3 = input.charCodeAt(i++);

      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;

      if (isNaN(chr2)) {
         enc3 = enc4 = 64;
      } else if (isNaN(chr3)) {
         enc4 = 64;
      }

      o += Base64.keyStr.charAt(enc1) + Base64.keyStr.charAt(enc2) + 
         Base64.keyStr.charAt(enc3) + Base64.keyStr.charAt(enc4);
      //sane line breaks every 64 characters (every 48 input characters)
      if (!options.dontbreak && (i % 48 == 0) && i < input.length)
        o += options.breakchar;
    }
   
    return o;
  },

	encode16: function(input) {
	  //assumes each "character" is two octets
    var o = "";
	  //6 input bytes  = 3 16-bit characters
    var chars = ["", "", "", 
                 "", "", ""];
    //6 output bytes = 8 8-bit characters
    var enc  = ["", "", "", "", 
							  "", "", "", "" ];
    var i = 0;

    while (i < input.length) {
			for(var k = 0; k < 3; ++k) {
				char16 = input.charCodeAt(i++);
				chars[k*2]   = char16 >> 8; //first byte
				chars[k*2+1] = char16 & 0xFF; //second byte
			}

			for(var k = 0; k < 2; ++k) {
				enc[k*4+0] = chars[k*3+0] >> 2;
				enc[k*4+1] = ((chars[k*3+0] & 3) << 4) | (chars[k*3+1] >> 4);
				enc[k*4+2] = ((chars[k*3+1] & 15) << 2) | (chars[k*3+2] >> 6);
				enc[k*4+3] = chars[k*3+02] & 63;
			}

      if (i-2 >= input.length) {
				enc[3] = 64;
				enc[4] = enc[5] = enc[6] = enc[7] = 65;
      } else if (i-1 >= input.length) {
				enc[6] = enc[7] = 64;
      }

			for(var k = 0; k < 8; ++k)
			  o += Base64.keyStr.charAt(enc[k]);
    }
   
    return o;
  },

	decode: function(input) {
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

    // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

    do {
      enc1 = Base64.keyStr.indexOf(input.charAt(i++));
      enc2 = Base64.keyStr.indexOf(input.charAt(i++));
      enc3 = Base64.keyStr.indexOf(input.charAt(i++));
      enc4 = Base64.keyStr.indexOf(input.charAt(i++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      output = output + String.fromCharCode(chr1);

      if (enc3 != 64) {
         output = output + String.fromCharCode(chr2);
      }
      if (enc4 != 64) {
         output = output + String.fromCharCode(chr3);
      }
    } while (i < input.length);

    return output;
  },

	decode16: function(input) {
		// remove all characters that are not A-Z, a-z, 0-9, +, /, or =
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
		
		//assumes each "character" is two octets
    var o = "";
	  //6 input bytes  = 3 16-bit characters
    var chars = ["", "", "", 
                 "", "", ""];
    //6 output bytes = 8 8-bit characters
    var enc  = ["", "", "", "", 
                "", "", "", "" ];
    var i = 0;
		
		while (i < input.length) {
		  for(var k = 0; k < enc.length; ++k)
			  enc[k] = Base64.decodeStr[input.charAt(i++)];
			
			for(var k = 0; k < 2; ++k) {
			  chars[k*3+0] = (enc[k*4+0] << 2) | (enc[k*4+1] >> 4);
        chars[k*3+1] = ((enc[k*4+1] & 15) << 4) | (enc[k*4+2] >> 2);
        chars[k*3+2] = ((enc[k*4+2] & 3) << 6) | enc[k*4+3];
				}
		
			//remember, 16 bit unicode
			o += String.fromCharCode(chars[0]*256+chars[1]);
		
			if (enc[3] != 64 && enc[4] != 64 && enc[5] != 64)
				o += String.fromCharCode(chars[2]*256+chars[3]);
		
			if (enc[6] != 64 && enc[7] != 64 && enc[8] != 64)
				o += String.fromCharCode(chars[4]*256+chars[5]);
			}

		return o;
	}
}