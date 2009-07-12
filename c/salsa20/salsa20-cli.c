/* Code by Daniel J. Bernstein
   public domain
   command-line client by Konstantin Welke
   Note: this is a very slow implementation
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ecrypt-portable.h"

#define ROTATE(a, b) ROTL32(a,b)
#define XOR(v,w) ((v) ^ (w))
#define PLUS(v,w) (U32V((v) + (w)))
#define PLUSONE(v) (PLUS((v),1))

static const char sigma[16] = "expand 32-byte k";
static const char tau[16] = "expand 16-byte k";

void keysetup(u32 x[16],const u8 *k,u32 kbits,u32 ivbits)
{
  const char *constants;

  x[1] = U8TO32_LITTLE(k + 0);
  x[2] = U8TO32_LITTLE(k + 4);
  x[3] = U8TO32_LITTLE(k + 8);
  x[4] = U8TO32_LITTLE(k + 12);
  if (kbits == 256) { /* recommended */
    k += 16;
    constants = sigma;
  } else { /* kbits == 128 */
    constants = tau;
  }
  x[11] = U8TO32_LITTLE(k + 0);
  x[12] = U8TO32_LITTLE(k + 4);
  x[13] = U8TO32_LITTLE(k + 8);
  x[14] = U8TO32_LITTLE(k + 12);
  x[0] = U8TO32_LITTLE(constants + 0);
  x[5] = U8TO32_LITTLE(constants + 4);
  x[10] = U8TO32_LITTLE(constants + 8);
  x[15] = U8TO32_LITTLE(constants + 12);
}

void ivsetup(u32 x[16],const u8 *iv)
{
  x[6] = U8TO32_LITTLE(iv + 0);
  x[7] = U8TO32_LITTLE(iv + 4);
  x[8] = 0;
  x[9] = 0;
}

static void salsa20_wordtobyte(u8 output[64],const u32 input[16])
{
  u32 x[16];
  int i;

  for (i = 0;i < 16;++i) x[i] = input[i];
  for (i = 20;i > 0;i -= 2) {
    x[ 4] = XOR(x[ 4],ROTATE(PLUS(x[ 0],x[12]), 7));
    x[ 8] = XOR(x[ 8],ROTATE(PLUS(x[ 4],x[ 0]), 9));
    x[12] = XOR(x[12],ROTATE(PLUS(x[ 8],x[ 4]),13));
    x[ 0] = XOR(x[ 0],ROTATE(PLUS(x[12],x[ 8]),18));
    x[ 9] = XOR(x[ 9],ROTATE(PLUS(x[ 5],x[ 1]), 7));
    x[13] = XOR(x[13],ROTATE(PLUS(x[ 9],x[ 5]), 9));
    x[ 1] = XOR(x[ 1],ROTATE(PLUS(x[13],x[ 9]),13));
    x[ 5] = XOR(x[ 5],ROTATE(PLUS(x[ 1],x[13]),18));
    x[14] = XOR(x[14],ROTATE(PLUS(x[10],x[ 6]), 7));
    x[ 2] = XOR(x[ 2],ROTATE(PLUS(x[14],x[10]), 9));
    x[ 6] = XOR(x[ 6],ROTATE(PLUS(x[ 2],x[14]),13));
    x[10] = XOR(x[10],ROTATE(PLUS(x[ 6],x[ 2]),18));
    x[ 3] = XOR(x[ 3],ROTATE(PLUS(x[15],x[11]), 7));
    x[ 7] = XOR(x[ 7],ROTATE(PLUS(x[ 3],x[15]), 9));
    x[11] = XOR(x[11],ROTATE(PLUS(x[ 7],x[ 3]),13));
    x[15] = XOR(x[15],ROTATE(PLUS(x[11],x[ 7]),18));
    x[ 1] = XOR(x[ 1],ROTATE(PLUS(x[ 0],x[ 3]), 7));
    x[ 2] = XOR(x[ 2],ROTATE(PLUS(x[ 1],x[ 0]), 9));
    x[ 3] = XOR(x[ 3],ROTATE(PLUS(x[ 2],x[ 1]),13));
    x[ 0] = XOR(x[ 0],ROTATE(PLUS(x[ 3],x[ 2]),18));
    x[ 6] = XOR(x[ 6],ROTATE(PLUS(x[ 5],x[ 4]), 7));
    x[ 7] = XOR(x[ 7],ROTATE(PLUS(x[ 6],x[ 5]), 9));
    x[ 4] = XOR(x[ 4],ROTATE(PLUS(x[ 7],x[ 6]),13));
    x[ 5] = XOR(x[ 5],ROTATE(PLUS(x[ 4],x[ 7]),18));
    x[11] = XOR(x[11],ROTATE(PLUS(x[10],x[ 9]), 7));
    x[ 8] = XOR(x[ 8],ROTATE(PLUS(x[11],x[10]), 9));
    x[ 9] = XOR(x[ 9],ROTATE(PLUS(x[ 8],x[11]),13));
    x[10] = XOR(x[10],ROTATE(PLUS(x[ 9],x[ 8]),18));
    x[12] = XOR(x[12],ROTATE(PLUS(x[15],x[14]), 7));
    x[13] = XOR(x[13],ROTATE(PLUS(x[12],x[15]), 9));
    x[14] = XOR(x[14],ROTATE(PLUS(x[13],x[12]),13));
    x[15] = XOR(x[15],ROTATE(PLUS(x[14],x[13]),18));
  }
  for (i = 0;i < 16;++i) x[i] = PLUS(x[i],input[i]);
  for (i = 0;i < 16;++i) U32TO8_LITTLE(output + 4 * i,x[i]);
}

void encrypt_bytes(u32 x[16],const u8 *m,u8 *c,u32 bytes)
{
  u8 output[64];
  int i;

  if (!bytes) return;
  for (;;) {
    salsa20_wordtobyte(output,x);
    x[8] = PLUSONE(x[8]);
    if (!x[8]) {
      x[9] = PLUSONE(x[9]);
      /* stopping at 2^70 bytes per nonce is user's responsibility */
    }
    if (bytes <= 64) {
      for (i = 0;i < bytes;++i) c[i] = m[i] ^ output[i];
      return;
    }
    for (i = 0;i < 64;++i) c[i] = m[i] ^ output[i];
    bytes -= 64;
    c += 64;
    m += 64;
  }
}

static char *name;

void usage() {
  fprintf(stderr, "usage: %s -iv iv -key key\n"
    "reads from stdin and writes to stdout\n"
    "encryption and decryption is the same operation\n"
    "iv must be 8 bytes hexadecimal\n"
    "key must be 16 or 32 bytes hexadecimal (32 bytes is recommended)\n"
    "visit http://cr.yp.to/snuffle.html for information about salsa20\n"
    "note that this is a very slow implementation.\n"
    "example: %s -iv 589e86414f0497e2 -key a30b7916eeccf02ea2bb5e8020d5a6a41cad1061589316b70211a734a3e8801c\n",
    name, name);
  exit(1);
};

size_t parse_hex(char *to_parse, size_t max_len, u8 *target, char *name) {
  size_t len = strlen(to_parse);
  size_t i = 0;
  if (len > max_len *2) {
    fprintf(stderr, "ERROR: %s is longer than %i hexadecimal bytes\n\n", name, max_len);
    usage();
  }
  while (i < max_len) {
    int temp;
    int error = sscanf(to_parse, "%02x", &temp);
    target[i] = (u8) (temp & 0xFF);
    if (error != 1)
      return i;
    ++i;
    to_parse += 2;
  }
  return i;
}

int main(int argc, char **argv) {
  u8 iv[8],
    key[32],
    in[64], 
    out[64];
  //state
  u32 x[16], keybits = 0;
  int have_key = 0, have_iv = 0, argi = 1;

  name = argv[0];
  
  //read arguments
  while (argi < argc) {
    if (!strcmp(argv[argi], "-iv")) {
      size_t parsed_len = parse_hex(argv[argi+1], sizeof(iv), iv, "iv");
      if (parsed_len != sizeof(iv)) {
        fprintf(stderr, "ERROR: please specify exactly 8 hexadecimal bytes as iv\n\n");
        usage();
      }
      have_iv = 1;
      argi += 2;
    } else if (!strcmp(argv[argi], "-key")) {
      size_t parsed_len = parse_hex(argv[argi+1], sizeof(key), key, "key");
      keybits = parsed_len * 8;
      if (keybits != 256 && keybits != 128) {
        fprintf(stderr, "ERROR: please specify exactly 16 or 32 hexadecimal bytes as key\n\n");
        usage();
      }
      have_key = 1;
      argi += 2;
    } else {
      fprintf(stderr, "ERROR: unknown argument: %s\n\n", argv[argi]);
      usage();
    }
  };

  if (!have_key || !have_iv) {
    if (!have_key)
      fprintf(stderr, "ERROR: please specify a key\n");
    if (!have_iv)
      fprintf(stderr, "ERROR: please specify an iv\n");
    fprintf(stderr, "\n");
    usage();
  }

  keysetup(x, key, keybits, sizeof(key));
  ivsetup(x, iv);

  int c;
  size_t i, size;
  do {
    for(i = 0; i < sizeof(in); ++i) {
      c = getchar();
      if (c == EOF)
        break;
      in[i] = c;
    }
    size = i;

    encrypt_bytes(x, in, out, size);

    for(i = 0; i < size; ++i)
      printf("%c", out[i]);
  } while (c != EOF);
  
  return 0;
};