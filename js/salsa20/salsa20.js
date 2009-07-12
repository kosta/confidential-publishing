/* javascript by Konstantin Welke
   heavily based on Daniel J. Bernsteins code
   public domain 
*/

salsa20 = {
  /* 32bit number */ rotate32: function(a, b) {
    return (a << b) | (a >>> (32-b));
  },

  /* 32bit number */ toLittleEndian32: function(/* 8bit string of at least lenght pos+4 */ b, pos) {
    if (!pos)
      pos = 0;
    return (b.charCodeAt(pos)   & 0xff) | 
          ((b.charCodeAt(pos+1) & 0xff) << 8) | 
          ((b.charCodeAt(pos+2) & 0xff) << 16) | 
          ((b.charCodeAt(pos+3) & 0xff) << 24);
  },

  /* array of 4 8bit numbers */ fromLittleEndian32: function(/* 32bit number */ a) {
    return [a & 0xff, (a >>> 8) & 0xff, (a >>> 16) & 0xff, (a >>> 24) & 0xff];
  },

  /* array of 64 8bit numbers */ fromLittleEndian: function(/* 16 32bit number */ a) {
    var out = [];
    for(var i = 0; i < 16; ++i)
      [ out[i*4], out[i*4+1], out[i*4+2], out[i*4+3] ] = salsa20.fromLittleEndian32(a[i]);
    return out;
  },

  /*array of 64 8bit numbers */ wordtobyte: function(/*array of 16 32bit numbers */ input)
  {
    var i;
    var x = [], out = [];
    for (i = 0; i < 16; ++i) 
      x[i] = input[i];
    for (i = 20; i > 0; i -= 2) {
      //rotation takes care of & 0xffffffff after addition
      x[ 4] = x[ 4] ^ salsa20.rotate32((x[ 0] + x[12]), 7);
      x[ 8] = x[ 8] ^ salsa20.rotate32((x[ 4] + x[ 0]), 9);
      x[12] = x[12] ^ salsa20.rotate32((x[ 8] + x[ 4]),13);
      x[ 0] = x[ 0] ^ salsa20.rotate32((x[12] + x[ 8]),18);
      x[ 9] = x[ 9] ^ salsa20.rotate32((x[ 5] + x[ 1]), 7);
      x[13] = x[13] ^ salsa20.rotate32((x[ 9] + x[ 5]), 9);
      x[ 1] = x[ 1] ^ salsa20.rotate32((x[13] + x[ 9]),13);
      x[ 5] = x[ 5] ^ salsa20.rotate32((x[ 1] + x[13]),18);
      x[14] = x[14] ^ salsa20.rotate32((x[10] + x[ 6]), 7);
      x[ 2] = x[ 2] ^ salsa20.rotate32((x[14] + x[10]), 9);
      x[ 6] = x[ 6] ^ salsa20.rotate32((x[ 2] + x[14]),13);
      x[10] = x[10] ^ salsa20.rotate32((x[ 6] + x[ 2]),18);
      x[ 3] = x[ 3] ^ salsa20.rotate32((x[15] + x[11]), 7);
      x[ 7] = x[ 7] ^ salsa20.rotate32((x[ 3] + x[15]), 9);
      x[11] = x[11] ^ salsa20.rotate32((x[ 7] + x[ 3]),13);
      x[15] = x[15] ^ salsa20.rotate32((x[11] + x[ 7]),18);
      x[ 1] = x[ 1] ^ salsa20.rotate32((x[ 0] + x[ 3]), 7);
      x[ 2] = x[ 2] ^ salsa20.rotate32((x[ 1] + x[ 0]), 9);
      x[ 3] = x[ 3] ^ salsa20.rotate32((x[ 2] + x[ 1]),13);
      x[ 0] = x[ 0] ^ salsa20.rotate32((x[ 3] + x[ 2]),18);
      x[ 6] = x[ 6] ^ salsa20.rotate32((x[ 5] + x[ 4]), 7);
      x[ 7] = x[ 7] ^ salsa20.rotate32((x[ 6] + x[ 5]), 9);
      x[ 4] = x[ 4] ^ salsa20.rotate32((x[ 7] + x[ 6]),13);
      x[ 5] = x[ 5] ^ salsa20.rotate32((x[ 4] + x[ 7]),18);
      x[11] = x[11] ^ salsa20.rotate32((x[10] + x[ 9]), 7);
      x[ 8] = x[ 8] ^ salsa20.rotate32((x[11] + x[10]), 9);
      x[ 9] = x[ 9] ^ salsa20.rotate32((x[ 8] + x[11]),13);
      x[10] = x[10] ^ salsa20.rotate32((x[ 9] + x[ 8]),18);
      x[12] = x[12] ^ salsa20.rotate32((x[15] + x[14]), 7);
      x[13] = x[13] ^ salsa20.rotate32((x[12] + x[15]), 9);
      x[14] = x[14] ^ salsa20.rotate32((x[13] + x[12]),13);
      x[15] = x[15] ^ salsa20.rotate32((x[14] + x[13]),18);
    }
    for (i = 0;i < 16;++i) 
      out[i] = (x[i] + input[i]) & 0xffffffff;
    return salsa20.fromLittleEndian(out);
  },

  /* array of 16 32bit numbers */ setup: function(/* 16 or 32 byte string */ key, /* 8 byte string */ iv) {
    var out = [ 0, 0, 0, 0, 
                0, 0, 0, 0, 
                0, 0, 0, 0, 
                0, 0, 0, 0 ],
      k=0;
    out[1] = salsa20.toLittleEndian32(key, 0);
    out[2] = salsa20.toLittleEndian32(key, 4);
    out[3] = salsa20.toLittleEndian32(key, 8);
    out[4] = salsa20.toLittleEndian32(key, 12);
    if (32 == key.length) { /* recommended */
      k += 16;
      constants = "expand 32-byte k";
    } else if (16 == key.length) { /* kbits == 128 */
      constants = "expand 16-byte k";
    } else
      throw "salsa20.setup(): key length must be 16 or 32 bytes, but is " + key.length;
    out[11] = salsa20.toLittleEndian32(key, k+0);
    out[12] = salsa20.toLittleEndian32(key, k+4);
    out[13] = salsa20.toLittleEndian32(key, k+8);
    out[14] = salsa20.toLittleEndian32(key, k+12);
    out[0] = salsa20.toLittleEndian32(constants, 0);
    out[5] = salsa20.toLittleEndian32(constants, 4);
    out[10] = salsa20.toLittleEndian32(constants, 8);
    out[15] = salsa20.toLittleEndian32(constants, 12);
    out[6] = salsa20.toLittleEndian32(iv, 0);
    out[7] = salsa20.toLittleEndian32(iv, 4);
    //number to increment
    out[8] = 0;
    out[9] = 0;

    return out;
  },

  /* 8bit string */ encrypt: function(/* 8bit string */ data, /* 16 or 32 byte string */ key, /* 8 byte string */ iv) {
    out = "";
    var i,
      bytes = data.length,
      pos = 0,
      state = salsa20.setup(key, iv);

    if (!bytes) 
      return out;
    for (;;) {
      output = salsa20.wordtobyte(state);
      state[8] = (state[8] + 1) & 0xffffffff;
      if (!state[8]) {
        state[9] = (state[9] + 1) & 0xffffffff;
        /* stopping at 2^70 bytes per nonce is user's responsibility */
        /* Konstantin Welke: javascript will mess up way before that anyway cause theres no 64bit integer type to index the input*/
      }
      if (bytes <= 64) {
        for (i = 0;i < bytes;++i) 
          out += String.fromCharCode(data.charCodeAt(pos+i) ^ output[i]);
        return out;
      }
      for (i = 0;i < 64;++i) 
        out+= String.fromCharCode(data.charCodeAt(pos+i) ^ output[i]);
      bytes -= 64;
      pos += 64;
    }
  },

  decrypt: function(data, key, iv) {
    return salsa20.encrypt(data, key, iv);
  }
};