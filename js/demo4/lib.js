//confidential publishing library - fourth try
//written by Konstantin Welke, 2009
//licensed under the GPLv2

function ctorEx(name) {
  return "function " + name + "() is a constructor. Did you forget 'new'?";
};

//constructor
function FileSystemFile = function(url) {
  //todo: replace with function.name or something
  if (!this)
    throw ctorEx("ContentFile");

  this.url = function() { return this._url; };
  this.setUrl = function(url) { this._url = url; };
  this.setUrl(url);

  this.setNotDirty = function() {
    //was the set() called on the content since last getWriteObject()?
    this._dirtySet = false; 
    //was append() called on the content since last getWriteObject()?
    //will not be set if _dirtySet is true
    this._dirtyAppend = "";
  };
  this.setNotDirty();

  this.get = function() { return this._content; };
  this.set = function(content) { 
    this._content = content; 
    this._dirtySet = true; 
    this._dirtyAppend = "";
  };
  this.append = function(content) { 
    this._content += content; 
    if (!this._dirtySet) 
      this._dirtyAppend += content;
  };
  this.getWriteObject() {
    //todo: writeme
    if (!this._dirtyAppend && !this._dirtySet)
	return null;
    var obj = {type: "server-message:" + 
        (this._dirtySet ? "update-file" : "append-file", content: this.get(),
      //todo: assumes "url" object - if that exists?
      name: this.url.getPath(),
      content: (this._dirtySet ? this._dirtyContent : this._dirtyAppend)
      });
    this.setNotDirty();
  };
  this.read() {
    this.content = fetch_url(url);
  };

  return this;
};

//constructor
function Salt(value, encryptedBy)
{
  //todo: replace with function.name or something
  if (!this)
    throw ctorEx("ContentFile");

  this._value = value;
  this._encryptedBy = encryptedBy;
  this._algo = "SHA-256";

  this.value = function() { return this._value; };
  this.encryptedBy = function() { return this._encryptedBy; };

  this.algo = function() { return this._algo; };
  this.setAlgo = function(algo) { this._algo = algo; };

  return this;
};

PublicName_internal(namespace, salt, privatePath, user) {
  var salt_value = (salt != null ? salt.value() : "");
  //todo: should the default algo be settable by the folder properties?
  var salt_algo = (salt != null ? salt.hash() : "SHA-256");
  return new jsSHA(salt_value + user.id() + ":"
    + namespace + ":/" + privatePath).hash();
}

function PublicName_Keys(salt, privatePath, user) {
  return PublicName_internal("keys", salt, privatePath, user);
};

function PublicName_Revision(salt, privatePath, user) {
  return PublicName_internal("revision", salt, privatePath, user);
}

function PublicName_Content(salt, privatePath, user) {
  return PublicName_internal("content", salt, privatePath, user);
}

function PublicName_FolderProperties(salt, privatePath, user) {
  return PublicName_internal("folder-properties", salt, privatePath, user);
}

function PublicName_FolderList(salt, privatePath, user) {
  return PublicName_internal("folder-list", salt, privatePath, user);
}

function User(id) {
  //todo: replace with function.name or something
  if (!this)
    throw ctorEx("User");
}; 

//constructor
function ContentFile(privatePath, salt = null, user) {
  //todo: replace with function.name or something
  if (!this)
    throw ctorEx("ContentFile");

  this._privatePath = privatePath;
  this._salt = salt;
  this._user = user;
  //parsed from the files
  this._content = null;
  this._keys = null;
  this._plain = null;
  this._revision = null;
  this._signedBy = null;
  this._verified = null;

  this._contentFile = new FileSystemFile(PublicName_Content(salt, privatePath, user));
  this._files = [this._contentFile]
  //this._files = [this._keysFile, this._revisionFile, this._contentFile];
  
  this.read = function() {
    //  - fetch content file
    //  - parse one NSON object
    //  - see whats missing from content file
    //  - fetch & parse missing files
    this._contentFile.read();
    //for(var i = 0; i < this._files.length; ++i)
      //todo: performance: parallel reads?
      //this._files[i].read();

    var parsed = nson.parseOne(this._contentFile.get());
    if (!parsedObj || !parsedObj[0])
      throw privatePath + ": no nson object in keys file";
    var parsedObj = parsed[0];
    //content will probably need to be untrans()'d (unless parsed.plain)
    this._content = this._contentFile.get().substr(parsed[1])
    this._plain = parsed.plain;
    if ("String" == typeof(parsedObj))
      //todo: implement decrypt()
      parsedObj = nson.parseOne(untrans(this.parsedObj, salt.trans()))[0];
    else if ("Object" == typeof(parsedObj) && parsedObj.trans) {
      parsedObj = nson.parseOne(untrans(this.parsedObj.value, parsedObj.trans()))[0];
    } else
      throw privatePath + ": first nson type is neither string nor object";

   if ("Object" != typeof(parsedObj))
     throw "ContentFile.read(): first parsed NSON type is not Object, even after transformation"

   //todo: parallel fetching of missing files
   if (!parsedObj.revision || !parsedObj.signature) {
     this._revisionFile = new FileSystemFile(PublicName_Revision(salt, privatePath, user));
     this._files.append(this._revisionFile);
     this._revisionFile.read();
     var revisionObj = nson.parse(this._revisionFile.get())[0];
     this.signature = revisionObj.signature;
     this.signedby = revisionObj.signedby;
     this.revision = revisionObj.revision;
   }

   if (!parsedObj.keys && !this._plain) {
     this._keysFile = new FileSystemFile(PublicName_Keys(salt, privatePath, user));
     this._files.append(this._keysFile);
     this._keysFile.read();
     var keysObj = nson.parse(this._keysFile.get())[0];
     if (typeof(keysObj) != "Array")
       //enforce "implicit array" :)
       keysObj = [keysObj];
     this.keys = keysObj;
   }

    //todo: implement me:
    //if "not plaintext":
    //  -look in keys array if we can actually decrypt a key
    //  -decrypt content if necessary

    //verify signature
  }

  this.write = function() {
    //todo: implement me!
    this._revision++;
  }

  //manipulate content
  this.set = function(content) {
    //sets the content
    this._content = content;
    this._dirtyContent = true;
  }
  this.append = function(content) {
    //appends the content
    this._content += content;
    if (!this_dirtyContent)
      this._dirtyContentAppended += content;
  }
  this.get = function() {
    //returns the content
    return this._content;
  }

  this.addKey = function(key) {
    //adds the key to the list of keys that can decrypt the content
    this._dirtyKeysAppended.push(key);
  }
  this.revision = function() {
    return this._revision;
  }
  this.setNotDirty = function() {
    //assumes revision number is incremented somewhere else
   this.dirtyContent = false;
   this.dirtyContentAppended = "";
   this.dirtyKeysAppended = [];
  }

  return this;
};