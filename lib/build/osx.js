/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Async = require("Async");
var Mkdirp = require("mkdirp");
var Rimraf = require("rimraf");
var Ncp = require("ncp").ncp;

var Util = require("./../util");
var Template = require("./../template");
var MediaLab = require("./../medialab");

var DEPENDENTLIBS_LIST = "dependentlibs.list";

function placeBinaries(macosDir, resourcesDir, buildDir, devMode, callback) {
  var xulBinSrc = Path.join(buildDir, "xulrunner-sdk", "bin", "XUL.framework",
                            "Versions", "Current");

  Util.log("  ... copying in xulrunner binaries");

  // Recursively copy in the bin/ directory out of the sdk.
  Fs.readdir(xulBinSrc, function(err, list) {
    if (err)
      return callback(err);

    Async.each(list,
      function(file, next) {
        var src = Path.join(xulBinSrc, file);
        var dest = Path.join(macosDir, file);
        // Special case 'dependentlibs.list'
        if (file == DEPENDENTLIBS_LIST)
          dest = Path.join(resourcesDir, file);
        if (devMode)
          Fs.link(src, dest, next);
        else
          Ncp(src, dest, next);
      },
      callback);
  });
}

function placeXulrunnerStub(macosDir, devMode, callback) {
  if (devMode)
    Util.log("  ... placing xulrunner-stub binary");

  var xulrunnerStubPath = Path.join(__dirname, "templates", "osx", "xulrunner-stub");
  Ncp(xulrunnerStubPath, Path.join(macosDir, "xulrunner-stub"), callback);
}

exports.outputAppShell = function(browserCodeDir, appInfo, buildDir, devMode, callback) {
  // first, determine the application name
  var outputDir = Path.join(buildDir, appInfo.title) + ".app"

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

      // We need to copy the contents of the SDKs XUL.framework into the MacOS
      // directory.
      var macosDir = Path.join(outputDir, "Contents", "MacOS");
      var resourcesDir = Path.join(outputDir, "Contents", "Resources");
      Async.each([macosDir, resourcesDir], Mkdirp, function(err) {
        if (err)
          return callback(err);

        placeBinaries(macosDir, resourcesDir, buildDir, devMode, function(err) {
          if (err)
            return callback(err);

          // Now it's time to write a parameterized Info.plist
          if (devMode)
            Util.log("  ... writing Info.plist");
          var infoPlistPath = Path.join(outputDir, "Contents", "Info.plist");
          var templatePath = Path.join(__dirname, "templates", "osx", "Info.plist.template");
          Template.subAndCopy(templatePath, infoPlistPath, {
            "application_name": appInfo.title,
            "application_shortname": appInfo.name,
            "short_version": appInfo.version,
            "full_version": (appInfo.version + "." + appInfo.build_id)
          }, function(err) {
            if (err)
              return callback(err);

            // We'll create the MacOS (binary) dir and copy over the xulrunner binary
            placeXulrunnerStub(macosDir, devMode, function(err) {
              if (err)
                return callback(err);

              // Finally, create the resources dir (where the xulrunner application
              // will live
              if (devMode)
                Util.log("  ... preparing resources directory");

              MediaLab.createIconset(browserCodeDir, resourcesDir, appInfo.appicon,
               "osx", devMode, function(err) {
                if (err)
                  return callback(err);

                callback(null, {
                  xulrunnerAppDir: resourcesDir,
                  outputDir: outputDir,
                  defines: {
                    "XP_OSX": 1
                  }
                });
              });
            }); // END placeXulrunnerStub
          }); // END Template.subAndCopy
        }); // END placeBinaries
      }); // END Async.each -> Mkdirp
    }
  });
};
