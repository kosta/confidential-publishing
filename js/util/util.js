//the following function courtesy of http://en.wikipedia.org/wiki/Xmlhttprequest
// Provide the XMLHttpRequest class for IE 5.x-6.x:
if( typeof XMLHttpRequest == "undefined" ) XMLHttpRequest = function() {
  try { return new ActiveXObject("Msxml2.XMLHTTP.6.0") } catch(e) {}
  try { return new ActiveXObject("Msxml2.XMLHTTP.3.0") } catch(e) {}
  try { return new ActiveXObject("Msxml2.XMLHTTP") } catch(e) {}
  try { return new ActiveXObject("Microsoft.XMLHTTP") } catch(e) {}
  throw new Error( "This browser does not support XMLHttpRequest." )
};

function echo_clear(nodename) { 
  if (nodename == null)
    nodename = "jsout";
  var jsout = document.getElementById(nodename);
  if (!jsout)
    throw "no element with id 'jsout' found";
  while(jsout.childNodes.length)
    jsout.removeChild(jsout.firstChild)
};
function echo_append(msg, nodename) { 
  if (nodename == null)
    nodename = "jsout";
  var jsout = document.getElementById(nodename);
  jsout.appendChild(document.createTextNode(msg));
  jsout.appendChild(document.createElement("br"));
};
function echo_set(msg, nodename) { 
  echo_clear(nodename); 
  echo_append(msg, nodename);
};

function pretty_hex(input) {
  //returns a "pretty" hex representation of the 8-bit input string
  //example: "de:ad:be:ef:12:8b:28:3a"
  if (input == undefined)
    return;
  hex = "";
  for(var i = 0; i < input.length; ++i) {
    var c = input.charCodeAt(i);
    if (c > 0xFF && !arguments[1].ignore_errors)
      throw "this is not a 8-bit string!";
    else
    hex += (c < 16 ? "0" : "") 
         + c.toString(16)
         + (i == input.length-1 ? "" : ":")
         + (i%16==15 ? " " : "");
  }
  return hex;
}

function straight_hex(input) {
  //returns a "straigh" hex representation of the 8-bit input string
  //example: "deadbeef128b283a"
  if (input == undefined)
    return;
  hex = "";
  var access;
  if (typeof input == "string")
    access = function(s,i) { return s.charCodeAt(i); };
  else if (input instanceof Array)
    access = function(s,i) { return s[i]; };
  else throw "straight_hex: input must be String or Array";
  for(var i = 0; i < input.length; ++i) 
    hex += (access(input,i) < 16 ? "0" : "") 
         + access(input,i).toString(16);
  return hex;
}

function to8bit(input) {
  //XMLHttpRequest adds 0xf700 to all binary data > 0x7f
  //this function simply removes the first byte using & 0xFF
  if (typeof input == "string") {
    //too bad, we cant actually manipulate JS strings, so we have to make a new one
    output = ""
    for(var i = 0; i < input.length; ++i)
      output += String.fromCharCode(input.charCodeAt(i) & 0xFF);
    return output;
  } else
    throw "and0xFF: type " + typeof input + ": implement me!"
}

function loadfiles(filenames, readyfunction) {
  function Fileloader(filenames, readyfunction) {
    this.filenames = filenames;
    this.files = {};
    this.requests = [];
    this.readyfunction = readyfunction;
    this.fired = false;
    this.loadfiles();
  }

  Fileloader.prototype.waitforall = function() {
    for(var i = 0; i < this.filenames.length; ++i)
      if (this.files[this.filenames[i]] == undefined)
        return;
    //now this is a lame mutex... dont know if its needed
    if (this.fired)
      return;
    this.fired = true;
    this.readyfunction(this.files);
  }

  Fileloader.prototype.loadfiles = function() {
    for(var i = 0; i < this.filenames.length; ++i) {
      this.requests[i] = new XMLHttpRequest();
      this.requests[i].open("GET", this.filenames[i], true);
      this.requests[i].onreadystatechange = function(filename, loader) {
        return function() {
          if(this.readyState == 4 && this.status == 200) {
            loader.files[filename] = this.responseText;
            loader.waitforall();
          }
          else if (this.readyState == 4 && this.status > 400) {
            throw "Fileloader::loadfiles(): Error code " + this.status;
          }
        }
      }(this.filenames[i], this);
      this.requests[i].send("");
    }
  }

  var loader = new Fileloader(filenames, readyfunction);
}

function fetch(url, opts) {
  //synchronously fetches a document
  opts = opts || {};
  var req = new XMLHttpRequest();
  if (!opts.dont_leak_random)
    url += "?leaking_random="+Math.floor(4294967296 * Math.random()).toString(16);
  req.open('GET', url, false);
//   if (content_type)
//     req.setRequestHeader("Content-Type", content_type);
  req.send(null);

  if (200 == req.status)
    return req.responseText;
  else {
    echo_append("fetch(): status code " + req.status + " fetching file '" + url + "'");
    throw("fetch(): status code " + req.status);
  }
};

//utf8_encode from webtoolkit.info, license unknown :(
function utf8_encode(string) {
  string = string.replace(/\r\n/g,"\n");
  var utftext = "";

  for (var n = 0; n < string.length; n++) {

    var c = string.charCodeAt(n);

    if (c < 128) {
      utftext += String.fromCharCode(c);
    }
    else if((c > 127) && (c < 2048)) {
      utftext += String.fromCharCode((c >> 6) | 192);
      utftext += String.fromCharCode((c & 63) | 128);
    }
    else {
      utftext += String.fromCharCode((c >> 12) | 224);
      utftext += String.fromCharCode(((c >> 6) & 63) | 128);
      utftext += String.fromCharCode((c & 63) | 128);
    }

  }

  return utftext;
};

//returns (binary) 8bit string from hexadecimal string
function h2s(h) {
  var ret = "";
  h.replace(/(..)/g,
    function(s) {
      ret += String.fromCharCode(parseInt(s, 16));
    });
  return ret;
}