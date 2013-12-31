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

function placeBinaries(currVerDir, buildDir, devMode, callback) {
  var xulBinSrc = Path.join(buildDir, "xulrunner-sdk", "bin", "XUL.framework",
                            "Versions", "Current");

  // Recursively copy in the bin/ directory out of the sdk 
  if (devMode) {
    Util.log("  ... copying in xulrunner binaries");
    Fs.link(xulBinSrc, currVerDir, callback);
  } else {
    Ncp(xulBinSrc, currVerDir, callback);
  }
}

function placeXulrunnerStub(outputDir, devMode, callback) {
  if (devMode)
    Util.log("  ... placing xulrunner binary");

  var macosDir = Path.join(outputDir, "Contents", "MacOS")
  Fs.mkdir(macosDir, function(err) {
    if (err)
      return callback(err);

    // var xulrunnerStubPath = Path.join(currVerDir, "xulrunner")
    var xulrunnerStubPath = Path.join(__dirname, "templates", "osx", "xulrunner-stub");
    Ncp(xulrunnerStubPath, Path.join(macosDir, "xulrunner"), callback);
  });
}

var ICON_SIZES = [16, 32, 64, 128, 256, 512];

function getAppIcon(browserCodeDir, appInfo) {
  var defaultIcon = {
    path: Path.join(__dirname, "templates", "default-icon.png"),
    size: 1024
  };
  if (!appInfo.appicon)
    return defaultIcon;

  var largest = Object.keys(appInfo.appicon).sort(function(a, b) {
    return parseInt(a, 10) - parseInt(b, 10);
  }).pop();
  // If there's no matching icon (not set in package.json or invalid size), we'll
  // use the default icon.
  if (!largest || ICON_SIZES.indexOf(parseInt(largest, 10)) == -1)
    return defaultIcon;

  return {
    path: Path.join(browserCodeDir, appInfo.appicon[largest].replace(/^[\/\\]*/, "")),
    icon: parseInt(largest, 10)
  };
}

function createIconset(browserCodeDir, outputDir, appInfo, devMode, callback) {
  var iconsetPath = Path.join(outputDir, "appicon.iconset");
  Fs.mkdir(iconsetPath, function(err) {
    if (err)
      return callback(err);

    var commands = [];
    var baseIcon = getAppIcon(browserCodeDir, appInfo);
    ICON_SIZES.forEach(function(size) {
      var outPath = Path.join(iconsetPath, "icon_" + size + "x" + size + ".png");
      commands.push(["sips", ["--resampleWidth", size, baseIcon.path, "--out", outPath]]);
      // Do retina icons too:
      //XXX: for some reason `iconutil` doesn't like working with the retina icons
      //     we generate below. WTF???
      // var retinaSize = size * 2;
      // outPath = Path.join(iconsetPath, "icon_" + size + "x" + size + "@2x.png");
      // commands.push(["sips", ["--resampleWidth", retinaSize, baseIcon.path, "--out", outPath]]);
    });

    // Use iconutil. This is MacOS only, still searching for a cross-platform
    // utility.
    commands.push(["iconutil", ["-c", "icns", iconsetPath], {cwd: Path.dirname(iconsetPath)}]);

    Util.spawnSeries(commands, function(err) {
      if (err) {
        Rimraf(iconsetPath, function() {});
        return callback(err);
      }
      Rimraf(iconsetPath, callback);
    });
  });
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

      // Now let's mock up a XUL.framework dir
      var frameworkDir = Path.join(outputDir, "Contents", "Frameworks", "XUL.framework");
      // Create the current version dir
      var currVerDir = Path.join(frameworkDir, "Versions");
      Mkdirp(currVerDir, function(err) {
        if (err)
          return callback(err);

        currVerDir = Path.join(currVerDir, "Current");
        placeBinaries(currVerDir, buildDir, devMode, function(err) {
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
            placeXulrunnerStub(outputDir, devMode, function(err) {
              if (err)
                return callback(err);

              // Finally, create the resources dir (where the xulrunner application
              // will live
              if (devMode)
                Util.log("  ... creating resources directory");
              var resourcesPath = Path.join(outputDir, "Contents", "Resources");
              Fs.mkdir(resourcesPath, function(err) {
                if (err)
                  return callback(err);

                createIconset(browserCodeDir, resourcesPath, appInfo, devMode, function(err) {
                  if (err)
                    return callback(err);

                  callback(null, {
                    xulrunnerAppDir: resourcesPath,
                    outputDir: outputDir,
                    defines: {
                      "XP_OSX": 1
                    }
                  });
                });
              });
            }); // END placeXulrunnerStub
          }); // END Template.subAndCopy
        }); // END placeBinaries
      }); // END Mkdirp
    }
  });
};
