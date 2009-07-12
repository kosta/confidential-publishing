/* openssl-compatible PKCS1_v1_5 RSA signatures
   written by Konstantin Welke, 2008.
   requires Tom Wu's BigInteger and RSA library for JavaScript.
   under the same licence as Tom Wu's Library (i think its BSD)
*/

RSAKey.hashtypes = {
  "MD2": String.fromCharCode(0x30, 0x20, 0x30, 0x0c, 0x06, 0x08, 0x2a, 
    0x86, 0x48, 0x86, 0xf7, 0x0d, 0x02, 0x02, 0x05, 0x00, 0x04, 0x10),
  "MD5": String.fromCharCode(0x30, 0x20, 0x30, 0x0c, 0x06, 0x08, 0x2a, 
    0x86, 0x48, 0x86, 0xf7, 0x0d, 0x02, 0x05, 0x05, 0x00, 0x04, 0x10),
  "SHA-1": String.fromCharCode(0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 
    0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14),
  "SHA-256": String.fromCharCode(0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 
    0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 
    0x04, 0x20),
  "SHA-384": String.fromCharCode(0x30, 0x41, 0x30, 0x0d, 0x06, 0x09, 
    0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02, 0x05, 0x00, 
    0x04, 0x30),
  "SHA-512": String.fromCharCode(0x30, 0x51, 0x30, 0x0d, 0x06, 0x09, 
    0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03, 0x05, 0x00, 
    0x04, 0x40) 
};

RSAKey.prototype.sign = function(/* 8 bit String */ s, hashtype) {
  var recommended_hashes = ", please use SHA-1, SHA-256, SHA-384 or SHA-512"
  if (!hashtype)
    hashtype = "SHA-256";
  if (!(hashtype in RSAKey.hashtypes))
    throw "Unknown hashtype: " + hashtype + recommended_hashes;
  if ("MD2" == hashtype || "MD5" == hashtype)
    throw "Hashtype not implemented: " + hashtype + recommended_hashes;

  var keylength_in_bytes = (this.n.bitLength()+7)>>3;
  var hash = new jsSHA(s).getHash(hashtype, "BIN");
  var hash_id = RSAKey.hashtypes[hashtype];
  var padding = "";
  var padding_length = keylength_in_bytes - hash.length - hash_id.length - 3;
  if (padding_length < 0)
    throw "key too short: padding length would be: " + padding_length;
  for(var i = 0; i < padding_length; ++i) 
    padding += String.fromCharCode(0xFF);
  var plain = String.fromCharCode(0, 1) + padding 
    + String.fromCharCode(0) + hash_id + hash;
  //debugging, TODO: REMOVE THE NEXT 4 STATEMENTS!
  debug_plain_sig = plain;
  debug_plain_sig_bi = parseBigInt(plain, 256);
  debug_decrypted_sig_bi = this.doPrivate(debug_plain_sig_bi);
  debug_decrypted_sig = debug_decrypted_sig_bi.toString(256);
  return this.doPrivate(parseBigInt(plain, 256)).toString(256);
}

RSAKey.prototype.verify = function(/* 8 bit String */ content, /* 8 bit String */ signature) {
  //"encrypt" signature to get plaintext
  enc_sig = this.doPublic(parseBigInt(signature, 256)).toString(256);
  var i = 0;
  //jsbn.toString can cut off the leading 0...
  if (0 == enc_sig.charCodeAt(0))
    ++i;
  if (1 == enc_sig.charCodeAt(i))
    ++i
  else
    return [false, "Verification failed: Expected 0x01 at position " 
      + i + ". Maybe wrong public key?"];

  //skip the 0xFF padding
  while (0xFF == enc_sig.charCodeAt(i))
    ++i;

  if (0 == enc_sig.charCodeAt(i))
    ++i;
  else
    return [false, "Verification failed: Expected 0x00 at position "
      + i + " (after padding). Maybe wrong public key?"];

  //find hash type
  var hash_type_start = i;
  if (0x30 == enc_sig.charCodeAt(i))
    ++i;
  else
    return [false, "Verification failed: Expected 0x30 at position "
      + i + ". Maybe unknown hash algorithm?"];

  var hash_type;
  switch(enc_sig.charCodeAt(i)) {
    case 0x20:
      return [false, "Verification failed: Hash algorithms MD2/MD5 not implemented."];
    case 0x21:
      hash_type = "SHA-1";
      break;
    case 0x31:
      hash_type = "SHA-256";
      break;
    case 0x41:
      hash_type = "SHA-384";
      break;
    case 0x51:
      hash_type = "SHA-512";
      break;
    default:
      return [false, "Verification failed: unknown hash algorithm."];
  }

  var hash_id = RSAKey.hashtypes[hash_type];
  if (enc_sig.substr(hash_type_start, hash_id.length) == hash_id)
    i = hash_type_start + hash_id.length;
  else
    return [false, "Verification failed: unknown hash algorithm (only first 2 bytes known)."];
  
  var content_hash = new jsSHA(content).getHash(hash_type, "BIN");
  if (content_hash == enc_sig.substr(i))
    return [true, "Verification SUCCESS", hash_type];
  else
    return [false, "Verification FAILED: Content has been MODIFIED!", hash_type];
}
