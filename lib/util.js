var Path = require("path");
var Fs = require("fs");

exports.findBrowserHTML = function(path) {
  // "examples" directory can be omitted, but we'll automatically append it to
  // verify that file exists.
  if (Fs.statSync(path).isDirectory()) {
    if (Fs.existsSync(Path.join(path, "index.html")))
      path = Path.join(path, "index.html");
    else if (Fs.existsSync(Path.join(path, "index.xhtml")))
      path = Path.join(path, "index.xhtml");
    else if (Fs.existsSync(Path.join(path, "index.svg")))
      path = Path.join(path, "index.svg")
  }
  // the path we return must have ui omitted
  return Path.normalize(path);
};
