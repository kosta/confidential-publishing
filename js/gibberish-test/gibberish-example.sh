echo "cat gibberish-example.aes | openssl enc -d -aes-256-cbc -a -k Rechert"
cat gibberish-example.aes | openssl enc -d -aes-256-cbc -a -k Rechert
echo 
#openssl enc: symmetric ciphers
# -d: decrypt
# -a: base64-decrypt the data
# -k: password