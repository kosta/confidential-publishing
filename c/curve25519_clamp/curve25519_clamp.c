#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char *name;

void usage() {
  fprintf(stderr, "usage: %s number\n"
    "generates a 32 byte curve25519 private key out of a 32 byte number (hexadecimal)\n", name);
  exit(1);
}

int main(int argc, char** argv) {
  name = argv[0];

  if (argc != 2)
    usage();

  if (64 != strlen(argv[1])) {
    fprintf(stderr, "wrong byte count: %i, should be 64 to encode 32 bytes\n", strlen(argv[1]));
    usage();
  }

  unsigned char x[32];
  int i, temp;
  for(i = 0; i < 32; ++i) {
    int error = sscanf(argv[1]+2*i, "%02x", &temp);
    x[i] = (unsigned char) (temp & 0xFF);
    if (error != 1) {
      fprintf(stderr, "something went wrong: sscanf(): %i\n", error);
      usage();
    }
  }

  //finally, the actual code... (by Daniel J. Bernstein)
  x[0] &= 248;
  x[31] &= 127;
  x[31] |= 64;

  //ok, we're done.
  for(i = 0; i < sizeof(x); ++i) {
    printf("%02x", x[i]);
  }
  printf("\n");

  return 0;
};