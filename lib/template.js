/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Fs = require("fs");

exports.fill = function(template, replacements) {
  return template
    .replace(/<%(.+?)%>/g, function(str, m) {
      return JSON.stringify(replacements[m] || "");
    })
    .replace(/\[%(.+?)%\]/g, function(str, m) {
      return replacements[m] || "";
    });
};

exports.fillObject = function(obj, replacements) {
  Object.keys(obj).forEach(function(key) {
    if (typeof obj[key] == "string")
      obj[key] = exports.fill(obj[key], replacements);
  });
  return obj;
};

exports.subAndCopy = function(src, dest, replacements, callback) {
  Fs.readFile(src, {encoding: "utf8"}, function(err, data) {
    if (err)
      return callback(err);

    Fs.writeFile(dest, exports.fill(data, replacements), callback);
  });
};
