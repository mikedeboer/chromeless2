/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Path = require("path");
var Fs = require("fs");
var Util = require("util");

exports.sanitizeArguments = function(argv) {
  // Return a clean slate.
  var ret = {verbose: argv.verbose, help: argv.help};
  ret.build = true;
  if (ret.package) {
    ret.package = true;
    ret.run = false;
  } else if (argv.run) {
    ret.package = false;
    ret.run = true;
  }

  if (!Array.isArray(argv.os))
    argv.os = [argv.os];
  ret.os = argv.os.map(function(os) {
    os = os.split("|");
    return {
      platform: exports.getPlatform(os[0]),
      arch: os[1] ? os[1].trim() : process.arch
    }
  });

  ret.apps = argv._;
  if (!ret.apps.length) {
    ret.apps.push(Path.join(process.cwd(), "examples", "api-demo", "index.html"));
  } else {
    ret.apps = ret.apps.map(exports.findAppHTML);
  }

  return ret;
};

exports.findAppHTML = function(path) {
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

// We like 'osx' better than 'darwin', for example.
exports.OSMap = {
  "darwin": "osx",
  "win32": "win",
  "windows": "win"
};

exports.getPlatform = function(platform) {
  platform = (platform || process.platform).trim();
  return exports.OSMap[platform] || platform;
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
