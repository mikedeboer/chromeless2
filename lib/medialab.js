/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");

var Rimraf = require("rimraf");

var ICON_SIZES = [16, 32, 64, 128, 256, 512];

/**
 * Retrieve the absolute path and size of the largest icon defined in an apps'
 * package.json `appicon` block.
 * If no definition is passed or it's empty, the default appicon will be returned.
 *
 * @param Object iconsDef Struct containing absolute paths to icons in various
 *                        sizes.
 * @returns Object with members `path` and `size`.
 */
exports.getAppIcon = function(iconsDef) {
  var defaultIcon = {
    path: Path.join(__dirname, "build", "templates", "default-icon.png"),
    size: 1024
  };
  if (!iconsDef)
    return defaultIcon;

  var largest = Object.keys(iconsDef).sort(function(a, b) {
    return a - b;
  }).map(function(size) {
    return parseInt(size, 10);
  }).pop();
  // If there's no matching icon (not set in package.json or invalid size), we'll
  // use the default icon.
  if (!largest || ICON_SIZES.indexOf(largest) == -1)
    return defaultIcon;

  return {
    path: iconsDef[largest],
    size: largest
  };
};

/**
 * Normalize the `iconsDef` struct to only contain absolute paths pointing to
 * icon resources.
 *
 * @param String basePath Path part each icon file path should be prefixed with.
 * @param Object iconsDef Struct containing absolute paths to icons in various
 *                        sizes.
 * @returns Normalized version of the `iconsDef` struct.
 */
function completePaths(basePath, iconsDef) {
  var res = {};
  Object.keys(iconsDef).forEach(function(size) {
    var path = iconsDef[size];
    res[parseInt(size, 10)] = path.indexOf(basePath) === 0 ?
                              path : Path.join(basePath, path.replace(/^[\/\\]*/, ""));
  });
  return res;
}

/**
 * Create an iconset resource to provide a packaged app with an icon. Each platform
 * may implement this differently, so OS-dependent labs will take of the processing.
 *
 * @param String   basePath  Path part each icon file path should be prefixed with.
 * @param String   outputDir Path to write the resulting iconset to.
 * @param String   platform  String identifying the target platform.
 * @param Boolean  devMode   Indicates if we're in Developer/ verbose mode.
 * @param Function callback  Function to call when done, with Error as first
 *                           argument.
 * @returns void
 */
exports.createIconset = function(basePath, outputDir, iconsDef, platform, devMode, callback) {
  iconsDef = completePaths(basePath, iconsDef);
  var iconsetPath = Path.join(outputDir, "appicon.iconset");
  Fs.mkdir(iconsetPath, function(err) {
    if (err)
      return callback(err);

    var commands = [];
    var baseIcon = exports.getAppIcon(iconsDef);
    var cleanup =  function(err) {
      Rimraf(iconsetPath, function() {
        // ^-- Ignore error Rimraf might return.
        callback(err);
      });
    };

    var Lab;
    try {
      Lab = require("./medialab/" + platform + "/image");
    } catch (ex) {
      return cleanup();
    }

    Lab.createIconset(iconsetPath, baseIcon, ICON_SIZES, iconsDef, function(err) {
      if (err)
        return cleanup(err);
      Rimraf(iconsetPath, callback);
    });
  });
};
