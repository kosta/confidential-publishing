//confidential publishing library - fourth try
//written by Konstantin Welke, 2009
//licensed under the GPLv2

//constructor
function FileSystemFile = function(url) {
  if (!this)
    throw "FileSystemFile() is a constructor. Did you forget 'new'?";

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
function ContentFile = function(privatePath, salt = "", user) {
  this._privatePath = privatePath;
  this._salt = salt;
  this._user = user;

  //one "keys" file, one revision file, one content file
  this._keysFile = new FileSystemFile(PublicName_Keys(salt, privatePath, user));
  this._revisionFile = new FileSystemFile(PublicName_Revision(salt, privatePath, user));
  this._contentFile = new FileSystemFile(PublicName_Content(salt, privatePath, user));
  this._files = [this._keysFile, this._revisionFile, this._contentFile];
  
  this.read = function() {
    //todo: is there map()?
    for(var i = 0; i < this._files.length; ++i)
      //todo: performance: parallel reads?
      this._files[i].read();
    //todo: parse data: implement me!
  }
  this.write = function() {
    //todo: implement me!
  }

  //manipulate content
  this.set = function(content) {
    //sets the content
    //todo: this might just be a little more complicated than that?
    this._contentFile.set(content);
  }
  this.append = function(content) {
    //appends the content
    //todo: might be more complicated?
    this._contentFile.append(content);
  }
  this.get = function() {
    //returns the content
    //todo: this might just be a little more complicated than that?
    return this._contentFile.get();
  }

  this.addKey = function() {
    //adds the key to the list of keys that can decrypt the content
    //todo: implement me
  }
};