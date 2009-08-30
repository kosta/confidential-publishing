//confidential publishing library - fourth try
//written by Konstantin Welke, 2009
//licensed under the GPLv2

var confidentialPublishing = function() {
  function makeFileSystemFile(givenUrl) {
    var url = givenUrl;
    var dirtySet, dirtyAppend;
    var content;

    function setNotDirty() {
	//was the set() called on the content since last getWriteObject()?
	this._dirtySet = false; 
	//was append() called on the content since last getWriteObject()?
	//will not be set if _dirtySet is true
	this._dirtyAppend = "";
      };
    setNotDirty();

    return {
      url: function() { return url; },
      //this.setUrl = function(url) { this._url = url; };	
      get: function() { return content; },
      set: this.set = function(newContent) { 
	content = newContent; 
	dirtySet = true; 
	dirtyAppend = "";
      },
      append: function(newContent) { 
	content += newContent; 
	if (!dirtySet) 
	  dirtyAppend += content;
      },
      getWriteObject: function() {
	//todo: writeme
	if (!this._dirtyAppend && !this._dirtySet)
	    return; //returns undefined
	var obj = {type: "server-message:" + 
	    (dirtySet ? "update-file" : "append-file"), 
	  content: (dirtySet ? this.get() : dirtySet),
	  //todo: assumes "url" object - does that exist?
	  name: this.url.getPath()
	  };
	this.setNotDirty();
	return obj;
      },
      read: function() {
	content = fetch_url(url);
      }
    } //returned object
  };

  var makeSalt = function(/*string*/ value, /*array*/ encryptedBy, /*string*/ algo) {
    var value = value || "";
    var encryptedBy = encryptedBy || [];
    var algo = algo || "SHA-256";

    return {
      value: function() { return value; },
      encryptedBy: function() { return encryptedBy; },
      algo: function() { return algo; }
    }
  };

  var makeUser = function(id) {
    return {
      id: function() { return id; }
    }
  };

  var makePublicNames = function(salt, privatePath, user) {
    function publicName(namespace) {
      //todo: should the default algo be settable by the folder properties?
      return new jsSHA(salt.value() + user.id() + ":" + namespace + ":/" + privatePath).getHash(salt.algo(), "HEX");
    }  
    return { //if this is too slow, maybe making them functions could be better
      keys: publicName("keys"),
      revision: publicName("revision"),
      content: publicName("content"),
      "folder-properties": publicName("folder-properties"),
      "folder-list": publicName("folder-list")
    }
  }; 

  function makeContentFile(aPrivatePath, aSalt, aUser) {
    var privatePath = aPrivatePath;
    var salt = aSalt;
    var user = aUser;
    //parsed from the files
    var content, keys, plain, revision, signature, signedBy, verified,
      dirtyContentSet, dirtyContentAppended, dirtyKeysAppended;
    var publicNames = makePublicNames(salt, privatePath, user);
    var contentFile = makeFileSystemFile(publicNames.content);
    var files = [contentFile]
    //files = [keysFile, revisionFile, contentFile];

    function setNotDirty() {
      //assumes revision number is incremented somewhere else
      dirtyContentSet = false;
      dirtyContentAppended = "";
      dirtyKeysAppended = [];
    }
    
    return {
      read: function() {
	//  - fetch content file
	//  - parse one NSON object
	//  - see whats missing from content file
	//  - fetch & parse missing files
	contentFile.read();
	//for(var i = 0; i < this._files.length; ++i)
	  //todo: performance: parallel reads?
	  //files[i].read();

	var parsed = nson.parseOne(contentFile.get());
	var parsedObj = parsed[0];
	if (!parsedObj || !parsedObj[0])
	  throw privatePath + ": no nson object in keys file";
	//content will probably need to be untrans()'d (unless parsed.plain)
	content = contentFile.get().substr(parsed[1])
	plain = parsedObj.plain;
	if ("String" == typeof(parsedObj))
	  //todo: implement decrypt()
	  //todo: encrypted by the salt itself?!
	  parsedObj = nson.parseOne(untrans(parsedObj, salt.value()))[0];
	else if ("object" == typeof(parsedObj) && parsedObj.trans) {
	  parsedObj = nson.parseOne(untrans(parsedObj.value, parsedObj.trans()))[0];
	} else
	  throw privatePath + ": first nson type is neither string nor object";

	if ("object" != typeof(parsedObj))
	  throw "ContentFile.read(): first parsed NSON type is not an Object but " + typeof(parsedObj) + ", even after transformation"

	//todo: parallel fetching of missing files
	if (!parsedObj.revision || !parsedObj.signature) {
	  revisionFile = makeFileSystemFile(publicNames.revision());
	  files.append(revisionFile);
	  revisionFile.read();
	  var revisionObj = nson.parse(revisionFile.get())[0];
	  signature = revisionObj.signature;
	  signedby = revisionObj.signedby;
	  revision = revisionObj.revision;
	}

	if (!parsedObj.keys && !plain) {
	  keysFile = new FileSystemFile(publicNames.keys());
	  files.append(keysFile);
	  keysFile.read();
	  var keysObj = nson.parse(keysFile.get())[0];
	  if (typeof(keysObj) != "array")
	    //enforce "implicit array" :)
	    keysObj = [keysObj];
	  keys = keysObj;
	}

	//todo: implement me:
	//if "not plaintext":
	//  -look in keys array if we can actually decrypt a key
	//  -decrypt content if necessary

	//verify signature
      }, //read()
      write: function() {
	//todo: implement me!
	revision += 1;
      },
      set: function(newContent) {
	//sets the content
	content = newContent;
	dirtyContentSet = true;
      },
      append: function(newContent) {
	//appends the content
	content += newContent;
	if (!dirtyContentSet)
	  dirtyContentAppended += newContent;
      },
      get: function() {
	//returns the content
	return content;
      },
      addKey: function(key) {
	//adds the key to the list of keys that can decrypt the content
	dirtyKeysAppended.push(key);
      },
      revision: function() {
	return revision;
      }
    }; //return
  };
  return { 
    makeSalt: makeSalt,
    makePublicNames: makePublicNames,
    makeUser: makeUser,
    makeFileSystemFile: makeFileSystemFile,
    makeContentFile: makeContentFile
  }
}() //confidentialPublishing