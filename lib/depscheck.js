/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Util = require("./util");
var Async = require("async");

var Platforms = ["linux", "osx", "win"];
var Features = exports.features = ["resize-image", "compression", "icon-tool",
                                   "resource-edit"];

var Checkers = {};
Platforms.forEach(function(platform) {
  Checkers[platform] = require("./depscheck/" + platform);
});

var Symbols = {
  ok: "✓",
  err: "✖",
  dot: "․"
};

// With node.js on Windows: use symbols available in terminal default fonts
if (Util.getPlatform() == "win") {
  Symbols.ok = "\u221A";
  Symbols.err = "\u00D7";
  Symbols.dot = ".";
}

var Colors = {
  "ok": 90,
  "err": 31,
  "dot": 90,
};

exports.color = function(type, text) {
  if (!type || !(type in Symbols))
    throw new Error("Invalid color/ symbol type.");

  text = text || Symbols[type];
  return "\u001b[" + Colors[type] + "m" + text + "\u001b[0m"
};

exports.check = function(platforms, features, callback) {
  if (!callback) {
    if (!features) {
      callback = platforms;
      platforms = null;
    } else {
      callback = features;
      features = null;
    }
  }
  if (!Array.isArray(platforms) || !platforms.length)
    platforms = [Util.getPlatform()];
  if (!features)
    features = [].concat(Features);
  
  var results = {};
  Async.eachSeries(platforms, function(platform, nextPlatform) {
    if (!Checkers[platform])
      return nextPlatform("Unsupported platform: '" + platform + "'");

    Checkers[platform].check(features, function(err, result) {
      if (err)
        return nextPlatform(err);

      results[platform] = result;
      nextPlatform();
    });
  }, function(err) {
    if (err)
      return callback(err);

    callback(null, results);
  });
};

exports.report = function(results) {
  console.log("Dependencies Check Results:\n");
  var oses = Object.keys(results);
  var captions = [];
  var longestCaption = 0;

  // First loop to determine the longest caption.
  oses.forEach(function(os) {
    var caption = Util.getPlatformCaption(os);
    longestCaption = Math.max(longestCaption, caption.length);
    captions.push(caption);
  });

  console.log(new Array(longestCaption).join(" ") + "  " + Features.join("\t") +
              "\tMissing");

  // Second loop to draw the lines.
  oses.forEach(function(os, idx) {
    var caption = captions[idx];
    var line = caption + new Array(longestCaption - caption.length).join(" ") + "  ";
    Features.forEach(function(feature) {
      var prefixLen = Math.floor(feature.length / 2);
      var suffixLen = feature.length - (prefixLen - 1);
      var code = feature in results[os] ? !results[os][feature] ? "err" : "ok" : "dot";
      line += new Array(prefixLen).join(" ") + exports.color(code) +
              new Array(suffixLen).join(" ") + "\t";
    });
    console.log(line + exports.color("dot", results[os].missing.join(",")));
  });
  console.log();
};
