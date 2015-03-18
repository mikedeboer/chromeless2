/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Mkdirp = require("mkdirp");
var Rimraf = require("rimraf");
var Ncp = require("ncp").ncp;

var Util = require("./../util");
var Template = require("./../template");

exports.outputAppShell = function(browserCodeDir, appInfo, buildDir, devMode, callback) {
  // first, determine the application name
  var outputDir = Path.join(buildDir, appInfo.title);

  if (devMode)
    Util.log("Building application in >" + outputDir + "< ...");

  // Obliterate old directory if present
  Fs.exists(outputDir, function(exists) {
    if (exists) {
      if (devMode)
        Util.log("  ... removing previous application");
      Rimraf(outputDir, cont);
    } else {
      cont();
    }

    function cont(err) {
      if (err)
        return callback(err);

      Mkdirp(outputDir, function(err) {
        if (err)
          return callback(err);

        // Create the current version dir
        var xulSrc = Path.join(buildDir, "xulrunner-sdk", "bin");
        var xulDst = Path.join(outputDir, "xulrunner");

        // and recursivly copy in the bin/ directory out of the sdk
        if (devMode)
          Util.log("  ... copying in xulrunner binaries");
        Ncp(xulSrc, xulDst, function(err) {
          if (err)
            return callback(err);

          // We'll copy over the xulrunner-stub binary to the top level
          if (devMode)
            Util.log("  ... placing xulrunner binary");

          var xulrunnerStubPath = Path.join(outputDir, "xulrunner", "xulrunner-stub");
          appInfo.finalBinaryPath = Path.join(outputDir, appInfo.title);
          Ncp(xulrunnerStubPath, appInfo.finalBinaryPath, function(err) {
            if (err)
              return callback(err);

            callback(null, {
              xulrunnerAppDir: outputDir,
              outputDir: outputDir,
              defines: {
                "XP_LINUX": 1
              }
            });
          });
        });
      });
    }
  });
};
