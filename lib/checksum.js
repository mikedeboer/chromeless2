/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Fs = require("fs");
var Crypto = require("crypto");

exports.calcHash = function(path, type, callback) {
  if (!callback) {
    callback = type;
    type = "md5";
  }
  if (!type)
    type = "md5";

  var hash = Crypto.createHash(type);
  var stream = Fs.createReadStream(path);
  var errored = false;
  stream.on("data", function(buf) {
    hash.update(buf);
  });
  stream.on("error", function(err) {
    errored = true;
    callback(err);
  });
  stream.on("end", function() {
    if (errored)
      return;
    callback(null, hash.digest("hex"));
  });
};

exports.match = function(path, checksum, type, callback) {
  exports.calcHash(path, type, function(err, result) {
    if (err)
      return callback(err);
    callback(null, result == checksum, result);
  });
};
