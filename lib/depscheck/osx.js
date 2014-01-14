/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Async = require("async");
var PosixUtil = require("./posix");

var CompressionTools = ["tar", "bzip2"];

var checks = {
  "resize-image": function(callback) {
    PosixUtil.hasExecutable("sips", function(exists) {
      callback(null, exists ? "sips" : false, exists ? null : "sips");
    });
  },
  "compression": function(callback) {
    var toolResults = {missing: []};
    Async.eachSeries(CompressionTools, function(tool, nextTool) {
      PosixUtil.hasExecutable(tool, function(exists) {
        toolResults[tool] = exists ? tool : false;
        if (!exists)
          toolResults.missing.push(tool);
        nextTool();
      });
    }, function() {
      callback(null, toolResults);
    });
  },
  "icon-tool": function(callback) {
    PosixUtil.hasExecutable("iconutil", function(exists) {
      callback(null, exists ? "iconutil" : false, exists ? null : "iconutil");
    });
  },
  "resource-edit": function(callback) {
    // For OSX, we don't need a resource-editor.
    callback(null, true, null);
  }
};

exports.check = function(features, callback) {
  var results = {missing: []};
  Async.eachSeries(features, function(feature, nextFeature) {
    if (!checks[feature])
      return nextFeature("No check found for feature '" + feature + "'");

    checks[feature](function(err, result, missing) {
      if (err)
        return nextFeature(err);

      if (typeof result == "object") {
        var ok = true;
        for (var keys = Object.keys(result), l = keys.length, i = 0; i < l && ok; ++i) {
          if (keys[i] == "missing")
            continue;
          results[keys[i]] = result[keys[i]];
          if (result[keys[i]])
            continue;
          ok = false;
        }
        results[feature] = ok;
        if (result.missing && result.missing.length)
          results.missing = results.missing.concat(result.missing);
      } else {
        results[feature] = result;
        if (missing)
          results.missing.push(missing);
      }
      nextFeature();
    });
  }, function(err) {
    if (err)
      return callback(err);
    callback(null, results);
  });
};
