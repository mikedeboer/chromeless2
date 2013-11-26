/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Path = require("path");
var Fs = require("fs");
var Util = require("util");

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

exports.escapeRegExp = function(str) {
  return str.replace(/([.*+?^${}()|[\]\/\\])/g, "\\$1");
};

var levels = {
    "info":  ["\033[90m", "\033[39m"], // grey
    "error": ["\033[31m", "\033[39m"], // red
    "fatal": ["\033[35m", "\033[39m"], // magenta
    "exit":  ["\033[36m", "\033[39m"]  // cyan
};

var _slice = Array.prototype.slice;

exports.log = function() {
  var args = _slice.call(arguments);
  var lastArg = args[args.length - 1];

  var level = levels[lastArg] ? args.pop() : "info";
  if (!args.length)
    return;

  var msg = args.map(function(arg) {
    return typeof arg != "string" ? Util.inspect(arg) : arg;
  }).join(" ");
  var pfx = levels[level][0] + "[" + level + "]" + levels[level][1];

  msg.split("\n").forEach(function(line) {
    console[level == "info" ? "log" : "error"](pfx + " " + line);
  });
};
