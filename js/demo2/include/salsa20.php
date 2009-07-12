<?php
/* php by Konstantin Welke
   heavily based on Daniel J. Bernsteins code
   public domain 
*/

function /* 32bit number */ salsa20_rotate32($a, $b) {
  //rotation is completely weird in PHP with negative numbers...
  $a = ($a + 0x100000000) & 0xffffffff;
  return (($a << $b) | (($a >> (32-$b)) & ~(0xffffffff << $b))) & 0xffffffff;
}

function /* 32bit number */ salsa20_toLittleEndian32(/* 8bit string of at least length pos+4 */ $b, $pos) {
  if (!$pos)
    $pos = 0;
  return ((ord($b[$pos])   & 0xff) | 
         ((ord($b[$pos+1]) & 0xff) << 8) | 
         ((ord($b[$pos+2]) & 0xff) << 16) | 
         ((ord($b[$pos+3]) & 0xff) << 24));
};

function /* array of 4 8bit numbers */ salsa20_fromLittleEndian32(/* 32bit number */ $a) {
  return array($a & 0xff, ($a >> 8) & 0xff, ($a >> 16) & 0xff, ($a >> 24) & 0xff);
};

function /* array of 64 8bit numbers */ salsa20_fromLittleEndian(/* 16 32bit number */ $a) {
  //for($i = 0; $i < count($a); ++$i) echo "fLE in: $i: {$a[$i]}<br>\n";
  $out = array();
  for($i = 0; $i < 16; ++$i) {
      $temp = salsa20_fromLittleEndian32($a[$i]);
      $out[$i*4] = $temp[0];
      $out[$i*4+1] = $temp[1];
      $out[$i*4+2] = $temp[2];
      $out[$i*4+3] = $temp[3];
    }
  //for($i = 0; $i < count($a); ++$i) echo "fLE out: $i: {$out[$i]}<br>\n";
  return $out;
};

function /*array of 64 8bit numbers */ salsa20_wordtobyte(/*array of 16 32bit numbers */ $input)
{
  $x = array();
  $out = array();
  for ($i = 0; $i < 16; ++$i) 
   $x[$i] = $input[$i];
  for ($i = 20; $i > 0; $i -= 2) {
    //for($j = 0; $j < count($x); ++$j) echo "wtb0 $i: x[$j]: {$x[$j]}<br>\n";
    //rotation takes care of & 0xffffffff after addition
    $x[ 4] = $x[ 4] ^ salsa20_rotate32(($x[ 0] + $x[12]), 7);
    $x[ 8] = $x[ 8] ^ salsa20_rotate32(($x[ 4] + $x[ 0]), 9);
    $x[12] = $x[12] ^ salsa20_rotate32(($x[ 8] + $x[ 4]),13);
    $x[ 0] = $x[ 0] ^ salsa20_rotate32(($x[12] + $x[ 8]),18);
    $x[ 9] = $x[ 9] ^ salsa20_rotate32(($x[ 5] + $x[ 1]), 7);
    $x[13] = $x[13] ^ salsa20_rotate32(($x[ 9] + $x[ 5]), 9);
    $x[ 1] = $x[ 1] ^ salsa20_rotate32(($x[13] + $x[ 9]),13);
    $x[ 5] = $x[ 5] ^ salsa20_rotate32(($x[ 1] + $x[13]),18);
    $x[14] = $x[14] ^ salsa20_rotate32(($x[10] + $x[ 6]), 7);
    $x[ 2] = $x[ 2] ^ salsa20_rotate32(($x[14] + $x[10]), 9);
    $x[ 6] = $x[ 6] ^ salsa20_rotate32(($x[ 2] + $x[14]),13);
    $x[10] = $x[10] ^ salsa20_rotate32(($x[ 6] + $x[ 2]),18);
    $x[ 3] = $x[ 3] ^ salsa20_rotate32(($x[15] + $x[11]), 7);
    $x[ 7] = $x[ 7] ^ salsa20_rotate32(($x[ 3] + $x[15]), 9);
    $x[11] = $x[11] ^ salsa20_rotate32(($x[ 7] + $x[ 3]),13);
    $x[15] = $x[15] ^ salsa20_rotate32(($x[11] + $x[ 7]),18);
    //for($j = 0; $j < count($x); ++$j) echo "wtb1 $i: x[$j]: {$x[$j]}<br>\n";
    $x[ 1] = $x[ 1] ^ salsa20_rotate32(($x[ 0] + $x[ 3]), 7);
    $x[ 2] = $x[ 2] ^ salsa20_rotate32(($x[ 1] + $x[ 0]), 9);
    $x[ 3] = $x[ 3] ^ salsa20_rotate32(($x[ 2] + $x[ 1]),13);
    $x[ 0] = $x[ 0] ^ salsa20_rotate32(($x[ 3] + $x[ 2]),18);
    $x[ 6] = $x[ 6] ^ salsa20_rotate32(($x[ 5] + $x[ 4]), 7);
    $x[ 7] = $x[ 7] ^ salsa20_rotate32(($x[ 6] + $x[ 5]), 9);
    $x[ 4] = $x[ 4] ^ salsa20_rotate32(($x[ 7] + $x[ 6]),13);
    $x[ 5] = $x[ 5] ^ salsa20_rotate32(($x[ 4] + $x[ 7]),18);
    $x[11] = $x[11] ^ salsa20_rotate32(($x[10] + $x[ 9]), 7);
    $x[ 8] = $x[ 8] ^ salsa20_rotate32(($x[11] + $x[10]), 9);
    $x[ 9] = $x[ 9] ^ salsa20_rotate32(($x[ 8] + $x[11]),13);
    $x[10] = $x[10] ^ salsa20_rotate32(($x[ 9] + $x[ 8]),18);
    $x[12] = $x[12] ^ salsa20_rotate32(($x[15] + $x[14]), 7);
    $x[13] = $x[13] ^ salsa20_rotate32(($x[12] + $x[15]), 9);
    $x[14] = $x[14] ^ salsa20_rotate32(($x[13] + $x[12]),13);
    $x[15] = $x[15] ^ salsa20_rotate32(($x[14] + $x[13]),18);
  }
  for ($i = 0; $i < 16; ++$i) 
    //dude, I loooooooove php additions... its just a plain WOW!
    $out[$i] = ($x[$i] + $input[$i] + 0x100000000) & 0xffffffff;
  return salsa20_fromLittleEndian($out);
};

function /* array of 16 32bit numbers */ salsa20_setup(/* 16 or 32 byte string */ $key, /* 8 byte string */ $iv) {
  $out = array();
  $k=0;
  $out[1] = salsa20_toLittleEndian32($key, 0);
  $out[2] = salsa20_toLittleEndian32($key, 4);
  $out[3] = salsa20_toLittleEndian32($key, 8);
  $out[4] = salsa20_toLittleEndian32($key, 12);
  if (32 == strlen($key)) { /* recommended */
    $k += 16;
    $constants = "expand 32-byte k";
  } else if (16 == strlen($key)) { /* kbits == 128 */
    $constants = "expand 16-byte k";
  } else
    throw new Exception("salsa20_setup(): key length must be 16 or 32 bytes, but is ".strlen($key));
  $out[11] = salsa20_toLittleEndian32($key, $k+0);
  $out[12] = salsa20_toLittleEndian32($key, $k+4);
  $out[13] = salsa20_toLittleEndian32($key, $k+8);
  $out[14] = salsa20_toLittleEndian32($key, $k+12);
  $out[0] = salsa20_toLittleEndian32($constants, 0);
  $out[5] = salsa20_toLittleEndian32($constants, 4);
  $out[10] = salsa20_toLittleEndian32($constants, 8);
  $out[15] = salsa20_toLittleEndian32($constants, 12);
  $out[6] = salsa20_toLittleEndian32($iv, 0);
  $out[7] = salsa20_toLittleEndian32($iv, 4);
  //number to increment
  $out[8] = 0;
  $out[9] = 0;

  return $out;
};

function /* 8bit string */ salsa20_encrypt(/* 8bit string */ $data, /* 16 or 32 byte 8bit string */ $key, /* 8 byte 8bit string */ $iv) {
  $out = "";
  $i = 0;
  $bytes = strlen($data);
  $pos = 0;
  $state = salsa20_setup($key, $iv);

  if (!$bytes) 
    return $out;
  for (;;) {
    $output = salsa20_wordtobyte($state);
    $state[8] = ($state[8] + 1) & 0xffffffff;
    if (!$state[8]) {
      $state[9] = ($state[9] + 1) & 0xffffffff;
      /* stopping at 2^70 bytes per nonce is user's responsibility */
    }
    if ($bytes <= 64) {
      for ($i = 0; $i < $bytes; ++$i) {
        $out .= chr(ord($data[$pos+$i]) ^ $output[$i]);
//         echo "$i: ".ord($data[$pos+$i])
//           ." / ".$output[$i]
//           ." / ".(ord($data[$pos+$i]) ^ $output[$i])."<br>\n";
      }
      return $out;
    }
    for ($i = 0; $i < 64; ++$i) 
      $out .= chr(ord($data[$pos+$i]) ^ $output[$i]);
    $bytes -= 64;
    $pos += 64;
  }
};

function salsa20_decrypt($data, $key, $iv) {
  return salsa20_encrypt($data, $key, $iv);
};
?>