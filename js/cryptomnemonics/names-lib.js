//Konstantin Welke, 2008
//licensed under GPLv2 or GPLv3
//"Cryptomnemotics" idea from Dan Kaminsky

names.generate_triples = function(digest) {
  var bits = {male: 9, female: 9, last: 14};
  var sum_bits = 0;
  for(var i in bits)
    sum_bits += bits[i];
  
  var n = digest.length * 8;
  var num_triples = Math.ceil(n / sum_bits);
  var triples_bytes = Math.ceil(num_triples * sum_bits / 8);
  //pad digest to triples_bytes
  var bytes_to_pad = triples_bytes - digest.length;
  for(var i = 0; i < bytes_to_pad; ++i)
    digest[i] = "\u0000";
  
  var triples = [];
  var bits_left_in_byte = 8;
  var i = 0; //digest
  for(var tri = 0; tri < num_triples; ++tri) {
    var current_triple = {};
    for(var name in bits) {
      var bits_used = 0;
      var name_index = 0;
      while(bits_used < bits[name]) {
        if (0 == bits_left_in_byte) {
          ++i;
          bits_left_in_byte = 8;
        }
        name_index = (name_index << 1) | ((digest.charCodeAt(i) >>> (8-bits_left_in_byte)) & 1);
        ++bits_used;
        --bits_left_in_byte;
      }
      current_triple[name] = names[name][name_index];
    }
    triples.push(current_triple);
  }
  
  return triples;
}

names.triple_to_string = function(triple) {
  return triple.female
       + " and " + triple.male 
       + " " + triple.last
}

names.get_names_from_digest = function(digest) {
  var triples = names.generate_triples(digest);
  var name = "";
  for(var i in triples)
    name += names.triple_to_string(triples[i]) + ",\n";
  return name.substr(0, name.length-2);
}