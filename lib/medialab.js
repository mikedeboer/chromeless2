/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");

var Rimraf = require("rimraf");

var ICON_SIZES = [16, 32, 64, 128, 256, 512];

exports.getAppIcon = function(basePath, iconsDef) {
  var defaultIcon = {
    path: Path.join(__dirname, "build", "templates", "default-icon.png"),
    size: 1024
  };
  if (!iconsDef)
    return defaultIcon;

  var largest = Object.keys(iconsDef).sort(function(a, b) {
    return a - b;
  }).pop();
  // If there's no matching icon (not set in package.json or invalid size), we'll
  // use the default icon.
  if (!largest || ICON_SIZES.indexOf(largest) == -1)
    return defaultIcon;

  return {
    path: iconsDef[largest],
    icon: largest
  };
};

function completePaths(basePath, iconsDef) {
  var res = {};
  Object.keys(iconsDef).forEach(function(size) {
    var path = iconsDef[size];
    res[parseInt(size, 10)] = path.indexOf(basePath) === 0 ?
                              path : Path.join(basePath, path.replace(/^[\/\\]*/, ""));
  });
  return res;
}

exports.createIconset = function(basePath, outputDir, iconsDef, platform, devMode, callback) {
  iconsDef = completePaths(basePath, iconsDef);
  var iconsetPath = Path.join(outputDir, "appicon.iconset");
  Fs.mkdir(iconsetPath, function(err) {
    if (err)
      return callback(err);

    var commands = [];
    var baseIcon = exports.getAppIcon(basePath, iconsDef);
    require("./medialab/" + platform + "/image").
      createIconset(iconsetPath, baseIcon, ICON_SIZES, iconsDef, function(err) {
        if (err) {
          Rimraf(iconsetPath, function() {});
          return callback(err);
        }
        Rimraf(iconsetPath, callback);
      });
  });
};
