/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");

var AppTemplate = require("./build/template");
var Modules = require("./build/modules");
var Util = require("./util");

var BuildConfig = null;

exports.getConfig = function(callback) {
  if (BuildConfig)
    return callback(null, BuildConfig);

  var configPath = Path.normalize(Path.join(__dirname, "..", "config", "build.json"));
  Fs.readFile(configPath, {encoding: "utf8"}, function(err, data) {
    if (err)
      return callback(err);

    BuildConfig = JSON.parse(data);
    callback(null, BuildConfig);
  });
};

// Generate a complete standalone application (inside of a folder). The output
// will be placed in build/ directory and the path to the application will be
// returned.
exports.appify = function(os, appToLaunch, buildDir, devMode, callback) {
  var appCodeDir = Path.dirname(appToLaunch);
  var self = this;

  var manifestPath = Path.join(appCodeDir, "package.json");
  Fs.exists(manifestPath, function(exists) {
    if (!exists) {
      return callback(new Error("Missing package.json app manifest file!"));
    }

    Fs.readFile(manifestPath, {encoding: "utf8"}, function(err, data) {
      if (err)
        return callback(err);

      var appInfo;
      try {
        appInfo = JSON.parse(data);
      } catch (ex) {
        return callback(new Error("Error whilst parsing package.json: " + ex.message));
      }
      if (!appInfo.name)
        appInfo.name = Path.basename(appCodeDir).toLowerCase();
      // BuildID is a required string to have.
      if (!appInfo.build_id)
        appInfo.build_id = Date.now() + "";
      // generate the application shell, returning the parameters of its creation
      // (like, the directory it was output into, and where inside that bundle the
      // xulrunner application files should be put)
      require("./build/" + os.platform).outputAppShell(appCodeDir, appInfo, buildDir, devMode, function(err, params) {
        if (err)
          return callback(err);

        self.outputXulApp(params.xulrunnerAppDir, os.xulrunnerPath, appToLaunch,
                          appInfo, params.defines, devMode, callback);
      });
    });
  });
};

// Generate a xul application (a directory with application.ini and other stuff).
// The application will be placed in the build/ directory and the path to it
// will be returned.
// TODO: make this able to generate apps for multiple platforms in one run.
exports.outputXulApp = function(outputDir, xulrunner, appToLaunch, appInfo, defines, devMode, callback) {
  var appCodeMain = Path.basename(appToLaunch);
  var appCodeDir = Path.dirname(appToLaunch);

  if (devMode)
    Util.log("Building xulrunner app in >" + outputDir + "< ...");

  exports.getConfig(function(err, config) {
    if (err)
      return callback(err);

    AppTemplate.create(outputDir, appInfo, devMode, function(err, templateDir) {
      if (err)
        return callback(err);

      AppTemplate.getHarnessOptions(outputDir, function(err, options) {
        if (err)
          return callback(err);

        Modules.place(config, appInfo, outputDir, appCodeDir, options.uuid, defines, devMode, function(err, moduleMappings) {
          if (err)
            return callback(err);

          // Register module additions for the harness-options.
          var harnessOpts = options.data;
          var mod, path;
          for (var moduleName in moduleMappings) {
            if (!moduleMappings.hasOwnProperty(moduleName) ||
                // module name may not clash with built-in modules:
                harnessOpts.paths[moduleName]) {
              continue;
            }

            mod = moduleMappings[moduleName];
            harnessOpts.paths[moduleName] = "resource://" + mod.dir;
            harnessOpts.resources[mod.dir] = mod.path;
            // CommonJS loader module name mapping:
            harnessOpts.mappings[moduleName] = mod.main;
          }

          // now re-write appinfo
          if (devMode)
            Util.log("  ... writing application info file");

          var appInfoPath = Path.join(outputDir, "app_code", "package.json");
          Fs.writeFile(appInfoPath, JSON.stringify(appInfo, null, 2), function(err) {
            if (err)
              return callback(err);

            // and write harness options
            if (devMode)
              Util.log("  ... writing harness options");

            var harnessPath = Path.join(outputDir, "harness-options.json");
            Fs.writeFile(harnessPath, JSON.stringify(harnessOpts, null, 2), function(err) {
              if (err)
                return callback(err);

              if (devMode) {
                Util.log("xul app generated in " + Path.relative(
                  Path.normalize(Path.join(__dirname, "..")),
                  outputDir)
                );
              }
              callback(null, outputDir);
            }); // END writeFile(harnessPath, ...)
          }); // END writeFile(appInfoPath, ...)
        }); // END Modules.place
      }); // END AppTemplate.getHarnessOptions
    }); // END AppTemplate.create
  }); // END exports.getConfig
};
