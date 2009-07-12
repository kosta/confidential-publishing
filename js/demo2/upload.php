<?php 
//possible return codes:
//401 Unauthorized if the signature was not syntactically correct
//403 Forbidden if final signature check failed
//423 Locked if the lock could not be acquired (todo: test if browsers barf)
//200 OK if everything worked fine
//500 Internal Server Error if an error occured

/*
  if the script is terminated prematurely (most likely due to running more 
  than the allowed time set in php.ini), the file upload will be incomplete
*/

/*
  how this works:
  the user sends an HTTP POST with the following arguments, as netstring pairs:

  lock: the file to lock. used as $file_to_lock. If the file cannot be locked,
    fail with error code 500
  time: the timestamp of the user, synchronized to the time of the server 
    (HTTP/1.1 urges servers to send the time), as human-readable ascii integer.
    servers can reject timestamps that are too old
  signedby: the key that signed the message (full key id)
  hash_algo: (optional) the hash algorithm to use. default is "sha256"
  enc_algo: (optional) the encryption algorithm to use. default is "salsa20"
  sig_algo: (optional) the signature algorithm to use. default is "RSA"
  Note: currently, only the default values are implemented

  using above information, iv = first bits of hash(time | contents of file to lock),
    where | is the concatenation operator. the iv uses as many bits as an iv from
    the hash as needed (salsa20 uses 128 bits, or 16 bytes)
  signature: RSASSA-PSS-signature of below content, encrypted using the pre-shared
    key between user and server, and the iv calculated above.
    A malicious user can easily calculate a valid iv, however from messages in the
    recent past (before the timeout), he cannot even create syntactically correct
    signatures because he cannot recover the keystream without a signature.
    This makes it very easy to check for faked signatures, as they only have to be
    checked syntactically. A RSASSA-PSS signature starts with 0x00 0x01 0xFF* 0x00
    followed by a 15 byte hash id. The chances of generating a syntactically correct
    signature by random data are thus smaller than guessing the random key.
    Note however that registered users with a shared secret and public key known
    to the server can try to DOS the server with a lot of requests. The current 
    implementation does not react to that. The signature signs the rest of the message.
    If the signature is not syntactially valid, abort operation here.

  any number of:
    nextfile: filename of the next file
    nextop: either "append", "replace", "delete" or "new". Files will only be 
      created if nextop is "new". If nextop is "new" and the file exists, this
      script fails.
    content: the content of the file. will be saved to a temporary file.

  After saving everything to temporary files, the signature is verified. Only if the 
    signature is valid, the files replace/append the users files.
*/

require("include/stringstream.php");
require("include/salsa20.php");

function is_whitespace($c) {
  return ctype_space($c);
  //return $c == ' ' || $c == '\t' || $c == '\n' || $c == '\v' || $c == '\f' || $c == '\r';
}

function read_netstring($handle, $hasher = FALSE) {
  //reads a netstring as specified by http://cr.yp.to/proto/netstrings.txt
  //short version: "length:string,"
  $length = "";
  while (true) {
    $c = fgetc($handle);
    if ($c === FALSE)
      throw new Exception("Expected digit or ':', got EOF");
    if ($hasher) {
      hash_update($hasher, $c);
    }
    if (is_numeric($c))
      $length .= $c;
    else if (!is_whitespace($c))
      break;
  }
  if ($c != ":")
    throw new Exception("Expected ':', got '$c'");
  $length = (int) $length;
  $string = "";
  $read = 0;
  while(!feof($handle) && $read < $length) {
    $string .= fread($handle, $length - $read);
    //lets hope strlen is O(1)
    $read = strlen($string);
  }
  if ($hasher) {
    hash_update($hasher, $string);
  }
  if (strlen($string) != $length)
    throw new Exception("String too short!");
  if (feof($handle))
    throw new Exception("EOF before ','");
  $c = fgetc($handle);
  if ($c != ',')
    throw new Exception("Expected ',', got '$c'");
  if ($hasher) {
    hash_update($hasher, $c);
  }
  return $string;
};

function fail($status, $message, $additional = "") {
  header("HTTP/1.0 $status $message");
  echo "<h1>$status ".(500 == $status ? "Internal Server Error - " : "")."$message</h1>";
  echo "&lt;additional info&gt;$additional&lt;/additional info&gt;<br>\n";
  exit;
};

function straight_hex($s) {
  $str = "";
  for($i = 0; $i < strlen($s); ++$i)
    $str .= "0x".dechex(ord($s[$i]))." ";
  return $str;
};

/* returns negative value on error, false on incorrect hash, true on correct hash */
function openssl_verify_hash($hash, $dec_signature, $public_key) {
  $signature = "";
  $ok = openssl_public_encrypt($dec_signature, $signature, $public_key, OPENSSL_NO_PADDING);
  if (!$ok)
    return -1;

  //signature format is 0x00 0x01 padding 0x00 hashid hash
  //SHA-256 hash id: (0x)30 31 30 0d 06 09 60 86 48 01 65 03 04 02 01 05 00 04 20
  if (ord($signature[0]) != 0 || ord($signature[1]) != 1)
    return -2;
  $i = 2;
  while(0xFF == ord($signature[$i]) && $i < strlen($signature))
    $i += 1;
  $i += 1;
  //$hashid starts here
  $sha_256_id = "\x30\x31\x30\x0d\x06\x09\x60\x86\x48\x01\x65\x03\x04\x02\x01\x05\x00\x04\x20";
  if (0x30 != ord($signature[$i]))
    return -3;
  if (0x31 != ord($signature[$i+1]))
    return -4;
  if (substr($signature, $i, strlen($sha_256_id)) != $sha_256_id)
    return -5;
  $ok = (substr($signature, $i+strlen($sha_256_id)) == $hash);
  return $ok ? 1 : 0;
}

if (count($_POST)) 
  fail(500, "form mode not supported");

$in = fopen("php://input", "r");
$o = "";
try {
  $lockfilename = NULL;
  $time = NULL;
  $signed_by = NULL;
  $hash_algo = "sha256";
  $enc_algo = "salsa20";

  while (true) {
    $key = read_netstring($in);
    $o .= "key $key<br>\n";
    switch($key) {
      case "hash-algo":
        $hash_algo = read_netstring($in);
        if ($hash_algo != "sha256")
          fail(500, "Unsupported hash_algo: '$hash_algo'");
        break;
      case "enc-algo":
        $enc_algo = read_netstring($in);
        if ($enc_algo != "salsa20")
          fail(500, "Unsupported enc_method: '$enc_method'");
        break;
      case "time":
        $user_time = read_netstring($in);
        $true_time = time();
        $allowed_time_delta = 120;
        if ($true_time < $user_time || $true_time > $user_time+$allowed_time_delta)
          fail(500, "Error: Token not from within last $allowed_time_delta seconds!");
        break;
      case "signedby":
        $signedby = read_netstring($in);
        //todo: check if its a valid key
        $userid = substr(strstr($signedby, ":"), 1);
        $userid_arr = explode("@", $userid);
        $user = $userid_arr[0];
        //todo: how to get domain?
        $o .= "signedby: '$signedby'<br>\nuser: '$user'<br>\nuserid: '$userid'<br>\n";
        if ($user == FALSE || $userid == FALSE || count($userid_arr) != 2 || "lastpageofthe.net" != $userid_arr[1])
          fail(500, "signedby not valid - must be full key id", $o);
        if ($user != "alice")
          fail(500, "user must be alice - todo: allow bob ;)", $o);
        break;
      case "lock":
        $lockfilename = read_netstring($in);
        break;
      case "signature":
        $o .= "lock: '$lockfilename', time: '$user_time', signedby: '$signedby'<br>\n";
        if (!$lockfilename || !$user_time || !$signedby)
          fail(500, "please specify lock, time, signedby before signature.", $o);
        break 2;
      default:
        //ignore anything but "token"
        $value = read_netstring($in);
        $o .= "ignoring $key: '$value'<br>\n";
        break;
    } //switch
  } //while

  //todo: check if its in the users path
  $basepath = "/home/kosta/uni/master/js/demo2/$user/";
  $lockfilename = "$basepath$lockfilename";
  $o .= "complete lockfilename: '$lockfilename'<br>\n";

  //todo: make iv_length dependent on $enc_algo
  $iv = substr(hash($hash_algo, $user_time.file_get_contents($lockfilename), true), 0, 16);

  //todo: get shared secret, public key from user
  $shared_secret = "abcdabcdabcdabcdabcdabcdabcdabcd";
  $user_public_key = openssl_pkey_get_public("-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1lq6C0WYTLjzAV9TLa2U\n13+8eMlo9nhWCOucRg2Teh724Frm+YtP9eWxkaoqmn/a1zl9JL+hpHZeKraqRUS/\nRwMIAnLYwbvhsQZN0FO0eT5t/bOWtcoD2PTERDgIsRPO6TP/3O7QGyLJ+K+e+s04\nyk6yoT0sQEj0MDOvmByFcJo9zYo8sOpnNjM9FOUQsovuWvEXvNbavwSBZGCvw9sw\nmQ5bY1pyUN1vvy06MVS+3B9AVFcv/W/+S0roYrUR8s2EYqous3e5ne0oEWc7Lz3K\nnqEwYSOZjMgLR9oisZvRzRjSIYlVdR2M/y7buE7CvJj7e2svw4SL2iqxQHlF9VlT\nFQIDAQAB\n-----END PUBLIC KEY-----");
  if ($user_public_key == FALSE)
    fail(500, "openssl: invalid public key!");

  $enc_signature = read_netstring($in);
  $signature = salsa20_decrypt(base64_decode($enc_signature), $shared_secret, $iv);
  $o .= "enc_signature: $enc_signature<br>\niv: ".base64_encode($iv)."<br>\nsignature:'".base64_encode($signature)."'<br>\n";

  //todo: check if signature is syntactically valid
  //todo: set hash algo according to signature, if valid
  
  //todo: get the files to write to and do it as atomically as possible
  //for now, just read the into memory
  $files = array();
  $nextfile = NULL;
  $nextop = NULL;
  $hasher = hash_init($hash_algo);

  while(!feof($in)) {
    $key = read_netstring($in, $hasher);
    $o .= "key $key<br>\n";
    switch($key) {
      case "nextfile":
        $nextfile = read_netstring($in, $hasher);
        break;
      case "nextop":
        $nextop = read_netstring($in, $hasher);
        break;
      case "content":
        if (!$nextfile || !$nextop) 
          fail(500, "please specify nextfile and nextop before content", $o);
        $files[] = (array("nextfile" => $nextfile, "nextop" => $nextop, "content" => read_netstring($in, $hasher)));
        $nextfile = NULL;
        $nextcontent = NULL;
        break;
      default:
        $value = read_netstring($in, $hasher);
        $o .= "ignoring key '$key', value '$value'<br>\n";
        break;
    }; //switch ($key)
  }; //while (!feof)

  //hash as binary string
  $final_hash = hash_final($hasher, true);
  $o .= "final hash: '$final_hash'";

  //check signature - we did our own hashing to we have to use our own 
  $ok = openssl_verify_hash ($final_hash, $signature , $user_public_key);
  if ($ok < -1)
    fail(500, "signature verification error");
  if ($ok == 0)
    fail(403, "signature check failed");

//   //aquire shared memory "file lock"
//   $shm_key = ftok($lockfilename, 't');
//   $shm_id = shmop_open($shm_key, "c", 0600, 1);
//   if (FALSE == $shm_id)
//     fail(423, "Could not aquire lock");

  //file must exist
//   $lockfilehandle = fopen($lockfilename, "r");
//   if (!$lockfilehandle)
//     fail(423, "Lockfile does not exist");
//   $locked = flock($lockfilehandle, LOCK_EX | LOCK_NB);
//   if (!$locked)
//     fail(423, "Could not acquire lock");

  //apply file operations;
  $someerror = array();
  foreach($files as $info) {
    $mode = ("append" == $info["nextop"] ? "a" : "w");
    $filehandle = fopen($basepath . $info["nextfile"], $mode);
    if (FALSE == $filehandle) {
      $someerror[] = $info["nextfile"];
    } else {
      fwrite($filehandle, $info["content"]);
      fclose($filehandle);
    }
  }

//   //release shared memory "file lock"
//   shmop_close($shm_id);
//   shmop_delete($shm_id);
  
  header(200, "Success!");
  if (count($someerror))
    foreach($someerror as $i)
      echo "$basepath$i\n";
  exit;

} catch(Exception $e) {  
  fail(500, "Erroar: ".$e->getMessage(), $o);
}
?>