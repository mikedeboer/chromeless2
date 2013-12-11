/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Fs = require("fs");
var Path = require("path");
var Sandbox = require("./sandbox");
var Util = require("./../util")

function check(expr, defines) {
  try {
    return Sandbox.eval(expr, defines);
  } catch(ex) {
    if (ex.message == expr + " is not defined")
      return false;
    throw new Error("Error parsing ifdef: " + expr + " - " + ex.message);
  }
}

exports.parse = function(content, defines, path, devMode) {
  path = path || "<internal file>"
  var line, m, j, l, res;
  var output       = [];
  var blockdefdata = [];
  var nowrite      = -1;
  var level        = 0;
  var ifMatched    = false;
  var blockdef     = "";
  var lines        = content.split("\n");

  for (j = 0, l = lines.length; j < l; j++) {
    line = lines[j];
    m = line.match(/^(.*)\s*\#(\w+)\s*(.*)/);
    if (m)
      line = m[1];

    if (nowrite == -1) {
      if (blockdef)
        blockdefdata.push(line);
      else
        output.push(line);
    }

    if (!m)
      continue;

    switch (m[2]) {
      case "begindef":
        if (blockdef)
          throw new Error(path + "(" + (j + 1) + ") - Fatal: Cannot nest #begindef");

        blockdefdata = [];
        blockdef = m[3].trim();
        break;
      case "enddef":
        if (!blockdef)
          throw new Error(path + "(" + (j + 1) + ") - Fatal: #enddef without #begindef");

        // Let's store our blockdef
        var blockdefd = blockdefdata.join("\n");
        
        if (devMode) {
          if (defines[blockdef] !== blockdefd)
            Util.log(path + "(" + (j + 1) + ") - WARNING differently defining Block:" + blockdef);
          else
            Util.log(path + "(" + (j + 1) + ") - Defining Block:#" + blockdef + "#");
        }

        defines[blockdef] = blockdefd;
        blockdef = "";
        break;
      case "ifdef":
      case "ifndef":
        level++; // elseif is similar case to ifdef/ ifndef
      case "elseif":
        res = check(m[3], defines);
        if ((m[2] == "ifndef" ? res : !res)) {
          nowrite = level;
          if (devMode)
            Util.log(path + "(" + (j + 1) + ") - Ignoring code by " + m[2] + " " + m[3]);
        } else {
          if (level == nowrite)
            nowrite = -1;
          ifMatched = true;
        }
        break;
      case "endif":
        if (level == nowrite)
          nowrite = -1;
        level--; // inside or outside??
        ifMatched = false;

        if (level < 0)
          throw new Error(path + "(" + (j + 1) + ") - Fatal: #endif missing #ifdef/ifndef " + level);
        break;
      case "define":
        if (nowrite == -1 ) {
          var def = m[3].split(" ");

          if (!defines[def[0]]) {
            if (devMode)
              Util.log(path + "(" + (j + 1) + ") - Defining:" + def[0] + " as:" + def[1]);
            defines[def[0]] = def[1];
          }
        }
        break;
      case "undef":
        if (nowrite == -1) {
          if (devMode)
            Util.log(path + "(" + (j + 1) + ") - Undefining:" + m[3]);
          delete defines[m[3].trim()];
        }
        break;
      case "else":
        if (nowrite == -1)
          nowrite = level;
        else if (level == nowrite && !ifMatched)
          nowrite = -1;
        break;
    }
  }

  if (blockdef)
    throw new Error(path + "(" + (j + 1) + ") - Fatal: #begindef without #enddef");

  if (level > 0)
    throw new Error(path + "(" + (j + 1) + ") - Fatal: #ifdef/#ifndef without #endif " + level);

  return output.join("\n");
};

exports.parseFile = function(path, defs, devMode, callback) {
  Fs.readFile(path, "utf8", function(err, content) {
    if (err)
      return callback(err);
    callback(null, exports.parse(content, defs, path, devMode));
  });
};
