<?php
  $key_public = openssl_get_publickey(file_get_contents('demo2/alice/longterm-0.pem'));
  var_dump($key_public);

  $start = microtime(true);
  for($i = 0; $i < 10000; ++$i)
    $verification_result = openssl_verify("I will be signed", base64_decode("YQ4sodRNJGhLNTkJWMWOPWcq/sw0lvhIGyMBgCZZdQSkxJ9sNUvi60BXuTQZXkux\nlNexc5J2G1cWnrJewKHpBGii3wSn2izxKBj3lp9nUL85XeNozpLuqwx6//cFNZKU\n81vv8CADMCBAxJ37/22RKWxNhD1\nfqibuwy5b1nCUjUsZ3PRFcge3lWQT7poRFRcK\nfcTXLFhGrLbY7lNeo+h2Hm2Ypd117pyC/uKgThEQCTua5W/lJhCE++OrhzqkIMJo\ntg4LZgCk7wtkqU4TiPEif/fgOHvGkkmzqFXSgBPYqYtKOzeC/86LGZiJwCgGrEXM+6oOImREFJJMGoojXgjDvQ=="), $key_public);
  $end = microtime(true);

  $time_taken = $end-$start;
  $verifications_per_second = 100000 / $time_taken;
  echo "verify: $verification_result, took {$time_taken}s. Thats about $verifications_per_second verifications/s<br>\n"
  
?>