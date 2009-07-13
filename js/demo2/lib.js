function clone(origin, copied) {
  //if anything inside references itself, this code is an infinite loop
  if(origin == null || typeof(origin) != 'object')
    return origin;

  var copy = new origin.constructor();
  for(var key in origin)
      copy[key] = clone(origin[key]);

  return copy;
};

function CryptoContext() {
  //crypto_context: 
  //{
  //    content and key can have URLs, so they have their own context
  //    subfolders have their own path anyway
  //    everything else CAN ONLY have a value - so its the folders context
  //    signature url is always get_salted_url(content.name + ".signature")
  //  signature.by: key
  //    design decision: ONLY ONE signature per content.
  //    possible: exception: public keys that are collected from friends
  //  signature.value: untransformed value
  //  signature.ok: true/false,
  //  signature.reason: string, 
  //  signature.algorithm : string,
  //  encrypted_by: object of {keyid: iv}
  //  encrypted_by_passkey: same as above
  //}
  this.signature = {};
  this.encrypted_by = {};
  this.encrypted_by_passkey = {};
};

CryptoContext.prototype.clone_signature = function() {
  var copy = new CryptoContext();
  copy.signature = clone(this.signature);
  return copy;
};

CryptoContext.prototype.clone_encrypted = function() {
  var copy = new CryptoContext();
  copy.encrypted_by = clone(this.encrypted_by);
  copy.encrypted_by_passkey = clone(this.encrypted_by_passkey);
  return copy
};

CryptoContext.prototype.invalidate = function (reason) {
  this.signature.ok = false;
  this.signature.reason = reason;
  return this;
};

CryptoContext.prototype.apply_meta = function(meta) {
  function get_from_trans(trans, context) {
    var transes = trans.split("|");
    for(var i = 0; i < transes.length; ++i) {
      var t = transes[i].split(":");
      if (t[0] != "enc")
        continue;
      if (t[1] == "passkey")
        context.encrypted_by_passkey[t[2]] = t[3];
      else
        context.encrypted_by[t[1]] = t[2];
    }
  }

  //signature
  this.signature.by = meta.signedby;
  this.signature.url = meta.signature_url;
  this.signature.urltrans = meta.signature_urltrans;

  var trans = meta.urltrans || meta.valuetrans;
  if (!trans)
    return;
  if (trans instanceof Array)
    for(var i = 0; i < trans.length; ++i)
      get_from_trans(trans[i], this)
  else
    get_from_trans(trans, this);
};

CryptoContext.prototype.get_trans = function(new_ivs) {
  //todo: when to write keyname, when keyid?
  var random = new SecureRandom();
  var trans = [];
  for(var i in this.encrypted_by) {
    if (new_ivs)
      this.encrypted_by[i] = straight_hex(random.stringOfLength(this.encrypted_by[i].length >> 1));
    trans.push("base64|enc:" + i + ":" + this.encrypted_by[i]);
  }
  for(var i in this.encrypted_by_passkey) {
    if (new_ivs)
      this.encrypted_by_passkey[i] = straight_hex(random.stringOfLength(this.encrypted_by_passkey[i].length >> 1));
    trans.push("base64|enc:passkey:" + i + ":" + this.encrypted_by_passkey[i]);
  }
  switch(trans.length) {
    case 0: return "base64";
    case 1: return trans[0];
    default: return trans;
  }
};

CryptoContext.prototype.get_b64_enc_value = function(value, folder) {
  var enc = [];
  for(var i in this.encrypted_by) {
    var key = userinfo.get_key(i, folder);
    if (!key)
      throw "Error: cannot encrypt: missing key: " + i;
    //todo: maybe we should internally use a 8bit binary IV instead of ASCII hex?
    enc.push(Base64.encode(key.encrypt(value, this.encrypted_by[i]), {dontbreak: true}));
  }
  for(var i in this.encrypted_by_passkey) {
    if (i != userinfo.passkey.name)
      throw "Error: cannot encrypt: missing passkey: " + i;
    enc.push(Base64.encode(userinfo.passkey.encrypt(value, this.encrypted_by_passkey[i]), {dontbreak: true}));
  }
  switch(enc.length) {
    case 0: return value;
    case 1: return enc[0];
    default: return enc;
  }
};

CryptoContext.prototype.get_url = function(meta, folder) {
  if (!folder)
    throw "CryptoContext.get_url(): syntax is meta, folder. meta can be null, folder must be set";
  //meta can be null, e.g. when getting url of folder
  if (this.signature.url)
    return this.signature.url;

  var namedpath = meta ? folder.namedpath + meta.name : folder.namedpath;
  var saltpath = "signature:" + userinfo.userid + ":" + namedpath;
  var plainurl = (meta? folder.baseurl + meta.name : folder.url) + ".signature";

  if (this.signature.salt) {
    return folder.baseurl + get_salted_name(this.signature.salt, this.signature.salttype, saltpath);
  } //this.signature.salt

  if (meta && meta.signature_url)
    return meta.signature_url;
  if (meta && meta.salt) {
    return folder.baseurl + get_salted_name(meta.salt, meta.salttype, saltpath);
  } // meta.salt
  
  //use folder salt
  if (folder.salt)
    return folder.baseurl + get_salted_name(folder.salt, folder.salttype, saltpath);
  
  return plainurl;
}


function Content(meta, crypto_context, folder) {
  this.name = meta.name;
  this.meta = meta;
  this.folder = folder;
  this.crypto_context = crypto_context;
}

Content.prototype.get_url = function () {
  return get_url_from_meta(this.meta, this.folder)
}

function Folder(name, user, url) {
  this.name = name;
  //namedpath is the "names" relative to the user directory, e.g. "files/tie-fighters"
  //will be set by add_subfolder (root folder has namedpath "")
  this.namedpath = "";
  this.up = null;
  this.user = user;
  //url is the actual url used in HTTP requests
  //e.g. "http://lastpageofthe.net/kosta/code/master/demo2/alice/files/881f4060b3e64c848d87896f31ec3ff1d71eda7c"
  //baseurl is the actual url used in HTTP requests, minus the "meta" 
  //part. This is used to construct the urls for the content in this
  //folder
  this.set_url(url);
  this.subfolders = {};
  this.content = {};
  this.untransformed = [];
  this.keys = {};
  this.defines_global_keys = {}; //format: name -> true
  this.salt = null;
  this.crypto_context = new CryptoContext();
};

Folder.prototype.set_url = function(url) {
  this.url = url;
  this.baseurl = url.substr(0, url.lastIndexOf("/")+1);
  //echo_append("folder '" + name + "' baseurl: '" + this.baseurl + "'");
}

//for compatibility with Content.get_url()
Folder.prototype.get_url = function() {
  return this.url;
}

Folder.prototype.fetch_and_parse = function() {
  if (this.fetched_and_parsed)
    return;
  this.fetched_and_parsed = true;
  var meta = fetch(this.get_url());
  this.src_meta = meta;
  process_meta(meta, this, this.crypto_context);
  //verify folder signature 
  if (this.crypto_context.signature.by) {
    try { 
      key = userinfo.get_key(this.crypto_context.signature.by, this);
    } catch (exception) {
      echo_append("process_one_meta(): signature error: " + exception);
    }
    if (key) {
      var verification_result = key.verify(this.src_meta, this.crypto_context.signature.meta.value);
      this.crypto_context.signature.ok = verification_result[0];
      this.crypto_context.signature.reason = verification_result[1];
      this.crypto_context.signature.algorithm = verification_result[2];
    } else
      this.crypto_context.invalidate("process_one_meta(): could not verify signature: unknown key: " + meta.signedby);
    this.crypto_context.signature.meta = undefined;
  }
  this.src_meta = undefined;
  return this;        
}

Folder.prototype.exists = function(name) {
  //checks whether folder or content by that name already exists
  return (this.content[name] || this.subfolders[name]);
};

Folder.prototype.full_url = function(url) {
  if (url && "/" != url[0] && -1 == url.indexOf("://"))
    //does start with / and theres no :// - its a local link
    return this.baseurl + url;
  else
    //complete link
    return url;
}

Folder.prototype.new_subfolder = function(meta) {
  var f = new Folder(meta.name, this.user, this.baseurl + meta.name + "/meta");
  if (this.exists(meta.name))
    throw "Folder.newSubFolder(): content or folder already exists: " + meta.name;
  f.namedpath = this.namedpath + "/" + f.name;
  f.up = this;
  if (userinfo.namedpaths[f.namedpath])
    throw "Folder.newSubFolder(): named path '" + f.namedpath + "' already exists in '" + this.namedpath + "'";
  userinfo.namedpaths[f.namedpath] = f;
  this.subfolders[meta.name] = f;
  if (meta.url) {
    f.set_url(this.full_url(meta.url));
    //true iff meta.url is set
    f.explicit_url = true; 
  }
  else if (this.salt)
    f.set_url(this.baseurl 
      + get_salted_name(this.salt, 
        meta.salttype || this.salttype || "SHA-1", 
        "folder:" + f.user.userid + ":" + f.namedpath));
  return f;
};

Folder.prototype.add_content = function(content) {
  if (this.exists(content.name))
    throw "Folder:add_content(): content or folder already exists: " + content.name;
  if (content.name == undefined || content.name == null)
    throw "Folder.add_content(): name cannot be " + content.name;
  this.content[content.name] = content;
  content.namedpath = this.namedpath + "/" + content.name;
  if (this.user.namedpaths[content.namedpath])
    throw "Folder.add_content(): namedpath '" + content.namedpath + "' already exists!";
  this.user.namedpaths[content.namedpath] = content;
};

Folder.prototype.to_subfolder_meta = function() {
  var meta = {type: "folder", name: this.name};
  if (this.explicit_url)
    meta.url = this.get_url();
  var s = JSON.stringify(meta);
  echo_append("to_subfolder_meta(): " + s);
  if (this.crypto_context.get_trans() != "base64") { //encrypted
      var cc = clone(this.crypto_context);
      s = '{ "type": "meta", '
        + '"valuetrans": "' + cc.get_trans(true) + '", '
        + '"value": "' + cc.get_b64_enc_value(s, this.up) + '" }\n';
    }
  echo_append("to_subfolder_meta(): " + s);
  return s;
}

Folder.prototype.to_meta = function() {
  /*
    First local key (must be value-based, not url-based),
    so that we can decode everything,
    Then salt, in case something is url-based,
    Then signature (url-based)
    Then subfolders (have their own url-based meta) and
    content (url-based)
  */
  //todo: warn if previously unsigned would be signed
  //todo: handle untransformed
  //todo: dont barf if we cant encrypt everything
  //todo: anyway, we need some other way to _manipulate_ meta
  var s = "";
  //local key definitions
  for(var i in this.keys) {
    //makes real key out of meta key, if necessary
    //local keys are always value-based
    var key = userinfo.get_key(i, this);
    var cc = clone(key.crypto_context);
    s += '{ "type": "key:' + key.type + '", '
      + '"name": "' + key.name + '", '
      + '"scope": "local", '
      + '"valuetrans": "' + cc.get_trans(true) + '", '
      + '"value": "' + cc.get_b64_enc_value(key.get_value(), this) + '" }\n';
  }
  //salt
  if (this.salt) {
    var cc = clone(this.crypto_context);
    s += '{ "type": "salt:' + this.salt_type + '", '
      + '"valuetrans": "' + cc.get_trans(true) + '", '
      + '"value": "' + cc.get_b64_enc_value(this.salt, this) + '" }\n';
  }
  //global keys that have been defined here
  for(var i in this.defines_global_keys) {
    var key = userinfo.keys[i];
    var cc = clone(key.crypto_context);
    //todo: value-based, url-based or some weird mixture?
    var obj = {type: "key:" + key.type,
      name: key.name,
      scope: "global",
      valuetrans: cc.get_trans(true),
      value: cc.get_b64_enc_value(key.get_value(), this) }
    s += JSON.stringify(obj) + "\n";
  }
  //signature - add it wether it is valid or not
  if (this.crypto_context.signature.by) {
    var obj = {type: "signature", urltrans: "base64", 
      signedby: this.crypto_context.signature.by};
    if (this.crypto_context.signature.explicit_url)
      obj.url = this.crypto_context.get_url(null, this);
    s += JSON.stringify(obj) + '\n';
  }
  for(var i in this.subfolders)
    s += this.subfolders[i].to_subfolder_meta();
  //content is _always_ in seperate, salted file
  for(var i in this.content) {
    var content = this.content[i], 
      crypto_context = this.content[i].crypto_context;
    var trans = crypto_context.get_trans();
    var content_meta = '{ "type": "content", "content-type": "' + content.meta["content-type"] + '" '
      + ', "name": "' + content.name + '" '
      + (crypto_context.signature.by ? ', "signedby": "' + crypto_context.signature.by + '", "signature_urltrans": "base64" ' : '')
      + ', "urltrans": "' + trans + '" }';
    echo_append("to_meta() content: " + content_meta);
    if ("base64" != trans) { //encrypted
      var cc = clone(crypto_context);
      s += '{ "type": "meta", '
        + '"valuetrans": "' + cc.get_trans(true) + '", '
        + '"value": "' + cc.get_b64_enc_value(content_meta, this) + '" }\n';
    } else 
      s += content_meta + "\n";
  }
  return s;
};

function get_salted_name(salt, salttype, name) {
  //todo: make SHA-256 the default
  salttype = salttype || "SHA-1";
  if (salttype != "SHA-1")
    throw "get_salted_name(): salt type not implemented yet: " + salttype;
  //return SHA1(salt + utf8_encode(name));
  return new jsSHA(salt + utf8_encode(name)).getHash("SHA-1", "HEX");
  //SHA1 returns hexdump... well seems like thats the standard... lets keep it that way...
};

function UserInfo(loginname, baseurl) {
  if (loginname.indexOf("@") == -1) {
    //append domain name to get user id
    this.username = loginname;
    this.userid = loginname + "@" + window.location.domainname;
  } else {
    this.username = loginname.substr(0, loginname.indexOf("@"));
    this.userid = loginname;
  }
  this.baseurl = baseurl + this.username + "/";
  this.keys = {};
  this.filetree = null; //new Folder("/", this, this.baseurl);
  this.salt_types = {"SHA-1": 0};
  this.namedpaths = {};
  this.parsed_secrets = false;
};

UserInfo.prototype.make_root_folder = function(baseurl) {
  this.filetree = new Folder("", this, baseurl);
  this.filetree.url = baseurl + "meta";
  this.filetree.fetch_and_parse();
  this.namedpaths[this.filetree.namedpath] = this.filetree;
};

UserInfo.prototype.get_key = function(name, folder) {
  //makes a real key out of a lazy key, if necessary

  function key_location() {
    return (folder && (name in folder.keys)) ? folder.keys : userinfo.keys;
  }

  var key = null;
  key = key_location()[name];
  if (!key && !this.parsed_secrets && this.filetree) {
    //avoid infinite loops :)
    this.parsed_secrets = true;
    //remove all global keys before refreshing
    this.keys = {};
    this.filetree.subfolders.secrets = undefined;
    this.filetree.new_subfolder({name: "secrets", url: "secrets/meta"});
    //allow adding global keys from this directory
    this.filetree.subfolders.secrets.allow_global_keys = true;
    //todo: correctly handle subfolders, doofus
    try {
      this.filetree.subfolders.secrets.fetch_and_parse();
    } catch (e) {
      echo_append("UserInfo.get_key(): could not parse 'secrets' folder: " + e);
    }
    key = key_location()[name];
  }
  if (key instanceof LazyKey) {
    try {
      key = make_key(key.meta, key.folder, key.crypto_context);
      key_location()[name] = key;
    } catch(e) {
      key = null;
      echo_append("UserInfo.get_key(): error with a lazy key: " + e);
    }
  }
  if (null == key)
    echo_append("UserInfo.get_key(): key not found: " + name);
  return key;
};

//makes a user-local URL out of a global url, if possible
UserInfo.prototype.local_url = function(url) {
  if (url.substr(0, this.baseurl.length) == this.baseurl)
    return url.substr(this.baseurl.length);
  return url;
}

function LazyKey(meta, folder, crypto_context) {
  this.meta = meta;
  this.folder = folder;
  this.crypto_context = crypto_context;
};

function verify(meta, folder, crypto_context) {
  if (meta.signature || meta.signedby) {
    if (!meta.signedby)
      return [meta, crypto_context.invalidate("signature without signed_by")];
    crypto_context.signature.by = meta.signedby;
    if (!meta.signature)
      return [meta, crypto_context.invalidate("signature without value")];
    try { 
      var key = userinfo.get_key(meta.signedby, folder);
    } catch (exception) {
      echo_append("verify(): error: " + exception);
    }
    if (key)
      [crypto_context.signature.ok, 
      crypto_context.signature.reason, 
      crypto_context.signature.algorithm] = key.verify(meta.value, meta.signature);
    else
      crypto_context.invalidate("unknown key: " + meta.signedby);
  }
  return [meta, crypto_context];
};

function get_url_from_meta(meta, folder) {
  if (meta.url) 
    return folder.full_url(meta.url);
  else {
    if (meta.salt) {
      //salt should habe been untransform()ed
      if (meta.salttrans)
        throw "could not completely untransform salt!";
      return folder.baseurl 
            + get_salted_name(meta.salt, 
                meta.salttype || folder.salttype || "SHA-1", 
                meta.name);
    } else {
      //use folder salt
      if (folder.salt)
        return folder.baseurl
              + get_salted_name(folder.salt, 
                  meta.salttype || folder.salttype || "SHA-1", 
                  meta.name);
      else
        return folder.baseurl + meta.name;
    } //no meta.salt
  } //no meta.url
} //function get_url_from_meta

function assemble(meta, folder, crypto_context) {
  //fetches URL. if necessary, applies urltrans

  var untransformed = untransform(meta, folder, crypto_context);
  meta = untransformed[0];
  crypto_context = untransformed[1];;
  if (meta.value)
    return verify(meta, folder, crypto_context);
  
  //there's no value, which means the value needs to be fetched from another file
  //this resets the signature information - only the encryption information is copied
  crypto_context = crypto_context.clone_encrypted();

  //there is no value: look in url or name
  var url = get_url_from_meta(meta, folder);
  
  echo_append("fetching " + url);
  try {
    var data = fetch(url);
  } catch (e) {
    echo_append("assemble(): error fetching " + data);
    crypto_context.ok = false;
    crypto_context.reason = "error fetching content";
    return [meta, crypto_context];
  }
  echo_append("done fetching " + url);

  //fetch signature, except if meta is a signature :)
  if (meta.signedby && undefined == meta.signature 
    && "signature" != meta.type) {
    if (meta.signature_url)
      crypto_context.signature.url = meta.signature_url;
    var signature_url = crypto_context.get_url(meta, folder);
    echo_append("fetching signature " + signature_url);
    try {
      meta.signature = fetch(signature_url);
      echo_append("done fetching signature " + signature_url);
      if (meta.signature_urltrans)
        meta.signature = untransform_pair(meta.signature, meta.signature_urltrans, "", crypto_context)[0];
    }
    catch (exception) {
      echo_append("error: " + exception);
      crypto_context.ok = false;
      crypto_context.reason = "error fetching content";
      //return [meta, crypto_context];
    }
  }

  if (undefined != meta.urltrans) {
    var pair = untransform_pair(data, meta.urltrans, folder, meta.type.split(":"), crypto_context);
    meta.value = pair[0];
    meta.urltrans = pair[1];
    crypto_context = pair[2]
  } else {
    meta.value = data; 
    crypto_context = pair[2];
  }

  return verify(meta, folder, crypto_context);
};

function untransform_pair(data, trans, folder, meta_types, crypto_context) {
  function untransform_one_pair(data, trans, folder, meta_types, crypto_context) {
    var types = trans.split("|");
    for(var i = 0; i < types.length; ++i) {
      var t = types[i].split(":");
      switch(t[0]) {
        case "base64":
          //needs base64-decoding
          data = Base64.decode(data);
          break;
        case "enc":
          //needs decryption
          if ("passphrase" == t[1]) {
            echo_append("warning: passphrase is depreciated. ignoring."); 
            return [data, types.slice(i, types.length).join("|"), crypto_context];
          } else if ("passkey" == t[1]) {
            //should have format "enc:passkey:name:iv"
            crypto_context.encrypted_by_passkey[t[2]] = t[3];
            if (t[2] == userinfo.passkey.name)
              data = userinfo.passkey.decrypt(data, t[3]);
            else {
              echo_append("cant handle passkey " + t[1]);
              return [data, types.slice(i, types.length).join("|"), crypto_context];
            }
          } else {
            //"enc" has form "enc:keyid:iv"
            crypto_context.encrypted_by[t[1]] = t[2];
            var key = userinfo.get_key(t[1], folder);
            if (key)
              data = key.decrypt(data, t[2]);
            else {
              echo_append("dont know key '" + t[1] 
                + "' :( skipping content of type " +  meta_types.join(":"));  
              return [data, types.slice(i, types.length).join("|"), crypto_context];
            }
          }
          break; //case "enc"
        default:
          //unknown transformation: we hope its terminal
          if (types.slice(i, types.length))
            type = types.slice(i, types.length).join("|");
          else
            type = undefined;
          return [data, trans, crypto_context];
      }
    }
    //done with all transformations;
    return [data, undefined, crypto_context];
  } //function untransform_one_pair

  //body of untransform_pair(data, trans, folder, meta_types, crypto_context) 
  //todo: handle multiple encryptions: look into all of data and see what encrypted them
  if (data instanceof Array && trans instanceof Array) {
    if (data.length != trans.length)
      throw("data and trans must have same array length");
    for(var i = 0; i < data.length; ++i) {
      var result = untransform_one_pair(data[i], trans[i], folder, meta_types, crypto_context);
      data[i] = result[0];
      trans[i] = result[1];
      crypto_context = result[2];
      if (!trans[i]) //we have a winner! - todo: do not discard all other crypto!
        return [data[i], undefined, crypto_context];
    }
    return [data, trans, crypto_context]; //we couldnt completely untransform any of them
  } else
    return untransform_one_pair(data, trans, folder, meta_types, crypto_context);
}; //function untransform_pair

function untransform(meta, folder, crypto_context) {
  //todo: iv should _always_ be hex!
  //url transformations are only done in assemble()
  var transforms = ['name', 'value', 'salt', 'plain'];
  var meta_types = meta.type.split(":");

  for(var i = 0; i < transforms.length; ++i) {
    if (meta[transforms[i]] && meta[transforms[i]+"trans"]) {
      var pair = untransform_pair(meta[transforms[i]], meta[transforms[i]+"trans"], folder, meta_types, crypto_context);
      meta[transforms[i]] = pair[0];
      meta[transforms[i]+"trans"] = pair[1];
      crypto_context = pair[2];
    }
  }
    
  return [meta, crypto_context];
};

function make_key(meta, folder, crypto_context) {
  function Key(symmetric) {
    this.symmetric = symmetric;
    this.encrypt = null;
    this.decrypt = null;
    this.sign = null;
    this.verify = null;
    this.key = null;
    this.localscope = false;
    this.name = null;
    this.crypto_context = null;
  };
  
  var assembled = assemble(meta, folder, crypto_context);
  meta = assembled[0];
  crypto_context = assembled[1];

  if (!meta.name || !meta.value)
    throw "could not make_key(): meta.name or meta.value missing.";

  var t = meta.type.split(":");
  //note: are we case-sensitive
  var key;
  if ("RSA" == t[1].substr(0,3)) {
    //todo: check keylength?
    key = new Key(false);
    key.key = RSAKey.new_key_from_openssl(meta.value);
    key.private = key.key.private;
    key.type = "RSA";
    key.hash = new jsSHA(key.key.to_openssl_public_key()).getHash("SHA-1", "BIN");
    key.mnemonic = names.get_names_from_digest(key.hash);
    key.encrypt = function(data) { //no iv, generates some salt on its own
      echo_append("encrypting with public key " + key.name);
      var m = this.key.pkcs1pad2(data,(this.key.n.bitLength()+7)>>3);
      if(m == null) throw("RSA encrypt: null after padding");
      var c = this.doPublic(m);
      if(c == null) throw("RSA encrypt: null after public encryption");
      echo_append("done encrypting");
      return c.toString(256);  
    }
    key.verify = function(data, signature) {
      return this.key.verify(data, signature); 
    }
    key.sign = function(data, hash_type) {
      return this.key.sign(data, hash_type);
    }
    if (key.private)
      key.decrypt = function(data) { //no iv, generates some salt on its own
      echo_append("decrypting with private key " + key.name);
      var bi = parseBigInt(data, 256);
      var padded = this.key.doPrivate(bi)
      var plain = pkcs1unpad2(padded, 
            (this.key.n.bitLength()+7)>>3);
      echo_append("done decrypting");
      return plain;
    }
    key.get_value = function() {
      return this.key.to_openssl();
    }
  } else if ("AES" == t[1].substr(0,3)) {
    key = new Key(true);
    key.key = meta.value;
    key.type = "AES";
    key.decrypt = function(/* 8bit string*/ data, /* hex string */ iv) {
      echo_append("decrypting with AES key " + key.name);
      try {
        var ret = GibberishAES.rawDecrypt(GibberishAES.s2a(data), 
          GibberishAES.s2a(this.key), 
          GibberishAES.h2a(iv));
        echo_append("done decrypting");
        return ret;
      } catch (e) {
        for(var i in e) 
          echo_append("GibberishAES said: " + i + ": " + e[i]);
        echo_append(straight_hex(data));
        echo_append(straight_hex(this.key));
        echo_append(iv); //iv is already hex string
        throw "Key.decrypt(): AES error. Bad key/iv?";
      }
    } 
    key.encrypt = function(/* 8bit string */ data, /*hex string */ iv) {
      echo_append("encrypting with AES key " + key.name);
      try {
        var ret = GibberishAES.a2s(GibberishAES.rawEncrypt(GibberishAES.s2a(data),
          GibberishAES.s2a(this.key),
          GibberishAES.h2a(iv)));
          echo_append("done encrypting");
          return ret;
      } catch (e) {
        echo_append("GibberishAES said: " + e);
        echo_append(straight_hex(data));
        echo_append(straight_hex(this.key));
        echo_append(iv); //iv is already hex string
        throw "Key.encrypt(): AES error. Bad key/iv?";
      }
    }
    key.get_value = function() {
      return this.key;
    }
  } /* ignore curve25519 for now 
    else if ("curve25519" == t[1]) {
    key = new Key(true);
    key.type = "curve25519";
    if (meta.plain) {
      //its a passphrase
      if (meta.plain != meta.value)
        throw "make_key(): plain != value. Maybe wrong passphrase?";
      key.key = userinfo.passkey;
      userinfo.passkey = undefined;
    } else
      key.key = meta.value;
    if (meta.private)
        key.private = true;
    //design decision: curve25519 uses salsa20. period.
    key.hash = new jsSHA(straight_hex(key.key)).getHash("SHA-1", "BIN");
    key.mnemonic = names.get_names_from_digest(key.hash);
    key.encrypt = function(data, iv) {
      echo_append("decrypting with curve25519 key " + key.name + " (using salsa20)");
      echo_append("ciphertext: " + straight_hex(data));
      echo_append("salsa key: " + straight_hex(this.key));
      echo_append("salsa iv: " + iv);
      return salsa20.encrypt(data, this.key, h2s(iv));
      echo_append("done decrypting.");
    }
    key.decrypt = key.encrypt;
    }*/ else
    throw "make_key: unknown type " + meta.type;

  key.name = meta.name;
  if ("local" == meta.scope)
    key.localscope = true;

  key.crypto_context= crypto_context;

  return key;
};

function add_key(key, folder) {
  //todo: add keys of different users
  if (key.localscope) {
    if (folder.keys[key.name])
      throw "add_key: key already exists in folder: " + key.name;
    folder.keys[key.name] = key;
  } else {
    if (userinfo.keys[key.name])
      throw "add_key: key already exists for user: " + key.name;
    userinfo.keys[key.name] = key;
  }
};

function remove_all_node_children(node) {
  while(node.childNodes.length)
    node.removeChild(node.firstChild)
};

function write_crypto_context_to(crypto_context, node, namedpath) {
  remove_all_node_children(node);
  var style, message;
  if (true == crypto_context.signature.ok) {
    style = "background-color: green; color: white;";
    message = "Signed by: " + crypto_context.signature.by;
  }
  else if (false == crypto_context.signature.ok) {
    style = "background-color: black; color: red; font-weight: bold;";
    message = "Signature is INVALID!\n" 
        + crypto_context.signature.reason + "\n"
        + "it should be signed with the key '" + crypto_context.signature.by 
        + "', but someone else modified the data.\nPlease do not trust below information.";
  } else {
    message = "Warning: This content has not been signed. It could have been modified by a third party. Usually, all content is signed. A malicious third party could have removed the signature. Please do not trust below information.";
    style = "background-color: red; color: white; font-weight: bold";
  }
  node.setAttribute("style", style);
  var lines = message.split("\n");
  for(var i in lines) {
    node.appendChild(document.createTextNode(lines[i]));
    node.appendChild(document.createElement("br"));
  }

  //todo: only display if its our own content!
  if (true != crypto_context.signature.ok) {
    node.appendChild(document.createElement("br"));
    var link = document.createElement("a");
    node.setAttribute("onclick", "sign_content_or_folder('" + namedpath + "')");
    link.appendChild(document.createTextNode("sign!"));
    node.appendChild(link);
  }
};

function sign_content_or_folder(namedpath) {
  var obj = userinfo.namedpaths[namedpath];
  if (!obj) {
    echo_append("sign_content_or_folder: content not found: '" + namepath + "'");
  }
  var typename = (obj instanceof Folder ? "Folder" : (obj instanceof Content? "Content" : "Unknown"));
  var folder = (obj instanceof Folder? obj : obj.folder);

  var ok = confirm("Are you sure you want to sign this "+ typename +" '" 
    + obj.name
    + "'? This means you vouch for the content!");
  if (!ok)
    return;

  var src;  
  //todo: key other than 'master'
  var signing_key = userinfo.get_key("master");
  var upload_array = [];
  if (obj instanceof Content) {
    //Content _plaintext_ is signed
    content_array = assemble(obj.meta, folder, obj.crypto_context);
    obj.meta = content_array[0];
    obj.crypto_context = content_array[1];
    src = obj.meta.value;
    if (!obj.crypto_context.signature.by) {
      //content is not signed according to the folder meta
      obj.crypto_context.signature.by = signing_key.name;
      folder_src = folder.to_meta();
      //sadly, this needs to be 2 different uploads (locking)
      upload(folder.get_url(), 
        [{url: folder.get_url(), op: "replace", content: folder_src},  
          {url: folder.crypto_context.get_url(null, folder), op: "replace", content: Base64.encode(signing_key.sign(folder_src))}]);
    }
  } else {
    if (obj.crypto_context.signature.by)
      //folder is signed "as is"
      src = fetch(obj.get_url());
    else {
      //need to insert signature
      obj.crypto_context.signature.by = signing_key.name;
      src = obj.to_meta();
      upload_array.push({url: obj.get_url(), op: "replace", content: src});
    }
  }
  echo_append("sign_content_or_folder(): fetching " + obj.get_url());
  //todo: sign with something else than "master"
  //todo: also, correct name would be "longterm-0"
  if (!signing_key)
    throw "sign_content_or_folder(): signing_key not found!";
  var signature = Base64.encode(signing_key.sign(src));
  var signature_url = obj.crypto_context.get_url(obj.meta, folder);
  upload_array.push({url: signature_url, op: "replace", content: signature})
  upload(obj.get_url(), upload_array);
}

function netstring(s) {
  if (s instanceof Array) {
    var ret = "";
    for(var i = 0; i < s.length; ++i)
      ret += netstring(s[i]);
    return ret;
  }
  else
    return s.length + ":" + s + ",";
}

function upload(lockfile_url, uploads) {
  //todo: move shared_secret to "secrets" folder
  //todo: error handling, especially permission problems
  var shared_secret = "abcdabcdabcdabcdabcdabcdabcdabcd";
  var body = "";
  for(var i = 0; i < uploads.length; ++i) {
    body += netstring(["nextop", uploads[i].op,
      "nextfile", userinfo.local_url(uploads[i].url),
      "content", uploads[i].content]);
  }
  //todo: replace with "newest private key"
  var plain_signature = userinfo.get_key("master").sign(body, "SHA-256");
  //Date.getTime() return microseconds sind epoch
  var expected_content = fetch(lockfile_url);
  var time = Math.floor(new Date().getTime() / 1000).toString(10);
  var iv = new jsSHA(time + expected_content).getHash("SHA-256", "BIN").substr(0, 16);
  var signature = Base64.encode(salsa20.encrypt(plain_signature, shared_secret, iv));
  var header = netstring(["signedby", "longterm-0:alice@lastpageofthe.net", 
    "time", time, 
    "lock", userinfo.local_url(lockfile_url),
    "enc-algo", "salsa20",
    "hash-algo", "sha256",
    "signature", signature]);

  var req = new XMLHttpRequest();
  //todo: find path for upload.php
  req.open('POST', "upload.php", false);
  //req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  req.send(header + body);
  echo_append("upload() message: " + header + body);
  echo_append("upload() status: " + req.status + " - " + req.statusText);
  echo_append("upload() server said: " + req.responseText);
}

function process_one_meta(meta, folder, crypto_context) {
  if (!folder)
    throw "process_one_meta called without 'folder' argument";
  //remove all non-terminal transformation
  var types = meta.type.split("|");
  for(var i = 0; i < types.length; ++i) {
    //type can be enc:name
    var t = types[i].split(":");
    echo_append("process_one_meta(): " +t[0]);
    switch(t[0]) {
      case "signature":
        var untransformed = untransform(meta, folder, crypto_context);
        meta = untransformed[0];
        crypto_context = untransformed[1];
        //there can only be one signature.
        if (folder.crypto_context.signature.by) 
          echo_append("process_one_meta(): ignoring second signature");
        else {
          echo_append("process_one_meta(): signature detected");
          //note: an attacker can trivially produce a result that leads to a verification failure. 
          //  There's nothing we can do about it.
          var key;
          crypto_context.signature.by = meta.signedby;
          crypto_context.signature.salt = meta.salt;
          if (meta.url) { 
            crypto_context.signature.url = meta.url;
            crypto_context.signature.explicit_url = true;
          } else {
            meta.url = crypto_context.get_url(null, folder);
          }
          //ignore crypto context of signature
          crypto_context.signature.meta = assemble(meta, folder, crypto_context)[0];
          //defer signature
        }
        break;
      case "salt":
        var untransformed = untransform(meta, folder, crypto_context);
        meta = untransformed[0];
        crypto_context = untransformed[1];
        if (folder.salt) 
          throw "process_one_meta(): salt already defined";
        if (folder.content.length)
          throw "process_one_meta(): salt after content";
        if (meta.valuetrans) {
          //salt requires untransformed value
          echo_append("process_one_meta(): cannot read salt: cant untransform: " + meta.valuetrans);
          folder.untransformed.push(meta);
        } else if (t[1] in userinfo.salt_types) {
          //todo: verify salt signature / use salt siginfo
          echo_append("process_one_meta(): setting salt for " + folder.name + ": " + pretty_hex(meta.value));
          folder.salt = meta.value;
          folder["salt_type"] = t[1];
        } else
          throw "process_one_meta(): unknown salt type " + t[1];
        break;
      case "folder":
        var untransformed = untransform(meta, folder, crypto_context);
        meta = untransformed[0];
        crypto_context = untransformed[1];
        if (meta.nametrans || meta.salttrans || meta.salttypetrans) {
          echo_append("process_one_meta(): Error: Folder.new_subfolder(): cannot untransform "
            + meta.nametrans || meta.salttrans || meta.salttypetrans);
          folder.untransformed.push(meta);
        } else
          folder.new_subfolder(meta, crypto_context);
        break;
      case "key":
        //note: key and content are the only types that get assembled
        //  "assemble" means fetch another URL
        //note: LazyKey defers fetching of URL until needed
        
        //keys always have their own crypto_context
        //if key has a value now, this means we clone the whole thing
        //otherwise, we just clone the encryption info
        var key_crypto_context;
        if (meta.value) {
          //dont let future encryptions modify this 
          key_crypto_context = clone(crypto_context);
          //but allow future signature checks
          key_crypto_context.signature = crypto_context.signature;
        } else //just use current encryptions
          crypto_context.clone_encrypted();
        key_crypto_context.apply_meta(meta);
        var untransformed = untransform(meta, folder, key_crypto_context);
        //if there were multiple transformations: untransformed might have ignored one
        meta = untransformed[0];
        key_crypto_context = untransformed[1];
        if (meta.valuetrans || meta.plaintrans) {
          echo_append("process_one_meta(): key: cannot untransform "
            + meta.valuetrans || meta.plaintrans);
          //todo: add siginfo context to folder.untransformed
          folder.untransformed.push(meta);
        } else {
          //todo: verify key signature
          //todo: correctly handle foreign keys
          var key = new LazyKey(meta, folder, key_crypto_context);
          var keys;
          if ("local" == meta.scope) {
            keys = folder.keys;
            if (keys[meta.name])
              throw "process_one_meta(): key already exists with name " + meta.name;
          }
          else {
            if (folder.allow_global_keys) {
              keys = userinfo.keys;
              if (keys[meta.name])
                throw "process_one_meta(): key already exists with name " + meta.name;
              folder.defines_global_keys[meta.name] = true;
            }
            else {
              echo_append("process_one_meta(): ignoring global key '" + key.name + "' from folder which does not allow it");
              continue;
            }
          }
          keys[meta.name] = key;
        }
        break;
      case "meta":
        //todo next: meta always has its own crypto context :)
        var meta_crypto_context = clone(crypto_context);
        var untransformed = untransform(meta, folder, meta_crypto_context);
        meta = untransformed[0];
        meta_crypto_context = untransformed[1];
        //recursive :)
        if (meta.valuetrans) {
          echo_append("process_one_meta(): meta: cannot untransform " + meta.valuetrans);
          folder.untransformed.push(meta);
        } else {
          process_meta(meta.value, folder, meta_crypto_context);
        }
        break;
      case "content":
        //the content has its own crypto_context
        //content will be assembled in show_content
        //we clone the encryption only because content never has a direction value
        //and we dont want to wait until it is assembled.
        var content_crypto_context = crypto_context.clone_encrypted();
        content_crypto_context.apply_meta(meta);
        //overrides user-injected crypto_context 
        folder.add_content(new Content(meta, content_crypto_context, folder));
        break;
      default:
        echo_append("process_one_meta(): unknown type " + t);
    }
  };
}

function process_meta(string, folder, crypto_context) {
  var meta = jsonParse(string, true);
  for(var i = 0; i < meta.length; ++i)
    try {
      process_one_meta(meta[i], folder, crypto_context);
    } catch(e) {
      echo_append("Error: " + e);
    }
};

function popup(title, content) {
  //todo: multiple clicks should not append to window
  //adding remove_all_node_children(pop.document.body) makes the window empty
  //todo: maybe that was because of an error? lets try again later with ie
  var pop = window.open("", title, "scrollbars=yes");
  //remove_all_node_children(pop.document.body);
  if ("string" == typeof(content)) {
    var lines = content.split("\n");
    for(var i in lines) {
      pop.document.body.appendChild(pop.document.createTextNode(lines[i]));
      pop.document.body.appendChild(pop.document.createElement("br"));
    }
  }
  return pop;
}
