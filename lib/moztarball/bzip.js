/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Fs = require("fs");
var Spawn = require("child_process").spawn;

exports.unpack = function(stream, fout, callback) {
  var tar = Spawn("tar", ["-x"], {cwd: fout});
  var bunzip2 = Spawn("bunzip2");
  // Pipe 'em good, pipe 'em real good!
  bunzip2.stdout.pipe(tar.stdin);
  stream.pipe(bunzip2.stdin);

  var err = "";
  tar.stderr.setEncoding("utf8");
  tar.stderr.on("data", function(data) {
    err += data;
  });
  tar.on("exit", function(code) {
    callback(code > 0 ? err : null);
  });
};
