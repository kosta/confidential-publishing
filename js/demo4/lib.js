//confidential publishing library - fourth try
//written by Konstantin Welke, 2009
//licensed under the GPLv2

//constructor
function FileSystemFile = function(name) {
  this._name = name;
  this.name = function() { return this._name; };
  this.setName = function(name) { this._name = name; };
  this._content = content;
  this._dirtySet = false;
  this._dirtyAppend = false;
  this.get = function() { return this._content; };
  this.set = function(content) { 
    this._content = content; 
    this._dirtySet = true; 
  };
  this.append = function(content) { 
    this._content += content; 
    if (!this._dirtySet) 
      this._dirtyAppend = false;
  };
  this.getMessage() {
    //todo: writeme
    if (!this._dirtyAppend && !this._dirtySet)
	return null;
    nson.stringify({type: "server-message:" + (this._dirtySet ? "update-file" : "append-file",
	content: this.get()});
    this._dirtyAppend = this._dirtySet = false;
  }
};