/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Spawn = require("child_process").spawn;

exports.hasExecutable = function(executable, callback) {
  var child = Spawn("which", [executable]);
  var out = "";
  var err = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", function(data) {
    out += data;
  });

  child.on("exit", function(code) {
    callback(code === 0 && out.indexOf(executable) > -1);
  });
};
