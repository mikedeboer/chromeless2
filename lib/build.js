/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Spawn = require("child_process").spawn;
var Async = require("async");
var Ncp = require("ncp").ncp;
var Uuid = require("uuid");

var Util = require("./util");
var Template = require("./template");
var Defines = require("./build/defines");

exports.executionModes = {
  "run": "run",
  "package": "run",
  "appify": "run",
  "docs": "sdocs",
  "test": "testex"
};

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

exports.package = function(buildDir, multi, callback) {
  callback();
};

// Generate a complete standalone application (inside of a folder). The output
// will be placed in build/ directory and the path to the application will be
// returned.
exports.appify = function(os, appToLaunch, buildDir, multi, devMode, callback) {
  var appCodeDir = Path.dirname(appToLaunch);
  var self = this;

  Fs.readFile(Path.join(appCodeDir, "package.json"), {encoding: "utf8"}, function(err, data) {
    if (err)
      return callback(err);

    var appInfo = JSON.parse(data);
    if (!appInfo.name)
      appInfo.name = Path.basename(appCodeDir).toLowerCase();
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
};

function createAppTemplate(templateDir, outputDir, devMode, callback) {
  // copy all the template files which require no substitution
  var appTemplate = Path.join(templateDir, "xulrunner.template");
  if (devMode)
    Util.log("  ... copying application template");

  Fs.readdir(appTemplate, function(err, files) {
    if (err)
      return callback(err);

    Async.eachSeries(files,
      function(file, next) {
        var src = Path.join(appTemplate, file);
        var dst = Path.join(outputDir, file);
        Ncp(src, dst, next);
      }, callback);
  });
}

function createAppManifest(templateDir, outputDir, appInfo, devMode, callback) {
  // sub in application.ini
  if (devMode)
    Util.log("  ... creating application.ini");

  var appIniTemplate = Path.join(templateDir, "application.ini.template");
  var appIniPath = Path.join(outputDir, "application.ini");

  Template.subAndCopy(appIniTemplate, appIniPath, {
    "application_name": appInfo.title,
    "application_vendor": appInfo.vendor,
    "short_version": appInfo.version,
    "build_id": appInfo.build_id,
    "developer_email": appInfo.developer_email
  }, callback);
}

function getHarnessOptions(templateDir, outputDir, callback) {
  var harnessTemplate = Path.join(templateDir, "harness-options.json.template");
  var harnessPath = Path.join(outputDir, "harness-options.json");

  var uuid = Uuid.v4();
  Fs.readFile(harnessTemplate, {encoding: "utf8"}, function(err, data) {
    if (err)
      return callback(err);

    data = Template.fill(data, {
      uuid: uuid,
      logfile: ""
    });
    callback(null, {
      uuid: uuid,
      data: JSON.parse(data)
    });
  });
}

function createFilePatternRegExp(excludes) {
  if (!excludes || !excludes.length)
    return null;

  var arrRegex = excludes.map(function(excl) {
    // An array of path chunks needs to be glued together.
    if (Array.isArray(excl))
      excl = Path.join.apply(Path, excl);
    return "(:?" + Util.escapeRegExp(excl) + ")";
  });
  return new RegExp("(:?" + arrRegex.join("|") + ")$");
}

function placeModules(outputDir, appCodeDir, uuid, defines, devMode, callback) {
  exports.getConfig(function(err, config) {
    if (err)
      return callback(err);

    if (devMode)
      Util.log("  ... copying in CommonJS modules");

    var moduleSourceDir = Path.normalize(Path.join(__dirname, "..", "modules"));
    var moduleTargetDir = Path.join(outputDir, "modules");
    Fs.mkdir(moduleTargetDir, function(err) {
      if (err)
        return callback(err);

      var modules = Object.keys(config.modules);
      Async.eachSeries(modules,
        function(moduleName, nextModule) {
          var moduleOpts = config.modules[moduleName];
          var src = [moduleSourceDir].concat(moduleOpts.path);
          src = Path.join.apply(Path, src);
          var dst = Path.join(moduleTargetDir, uuid + "-" + moduleName);
          var excludeRegex = createFilePatternRegExp(moduleOpts.exclude);
          var toPreprocessList = [];
          var preprocessRegex = createFilePatternRegExp(moduleOpts.preprocess);

          // TODO: allow symlinking!
          Ncp(src, dst, {
            filter: function(subject) {
              // Files that require preprocessing will be dealt with later.
              if (preprocessRegex && preprocessRegex.test(subject)) {
                toPreprocessList.push(Path.basename(subject));
                return false;
              }
              return !excludeRegex || !excludeRegex.test(subject);
            }
          }, copyIncludes);

          function copyIncludes(err) {
            if (err)
              return nextModule(err);

            Async.eachSeries(moduleOpts.include,
              function(include, nextInclude) {
                var includeSrc = [moduleSourceDir].concat(include);
                includeSrc = Path.join.apply(Path, includeSrc);
                // Destination dir is the base destination of the module + file-
                // name of the include.
                var includeDst = Path.join(dst, include.pop());
                // TODO: allow symlinking!
                Ncp(includeSrc, includeDst, nextInclude);
              }, function(err) {
                if (err)
                  return nextModule(err);

                Async.eachSeries(toPreprocessList,
                  function(toPreprocess, nextFile) {
                    var preprocessSrc = Path.join(src, toPreprocess);
                    var preprocessDst = Path.join(dst, toPreprocess);
                    Defines.parseFile(preprocessSrc, defines, devMode, function(err, content) {
                      if (err)
                        return nextFile(err);
                      Fs.writeFile(preprocessDst, content, "utf8", nextFile);
                    });
                  }, nextModule);
              });
          }
        }, function(err) {
          if (err)
            return callback(err);

          // And app code
          if (devMode)
            Util.log("  ... copying in app code (" + appCodeDir + ")");
          Ncp(appCodeDir, Path.join(outputDir, "app_code"), callback);
        }); // END eachSeries(modules)
    }); // END mkdir
  }); // END getConfig
}

// Generate a xul application (a directory with application.ini and other stuff).
// The application will be placed in the build/ directory and the path to it
// will be returned.
// TODO: make this able to generate apps for multiple platforms in one run.
exports.outputXulApp = function(outputDir, xulrunner, appToLaunch, appInfo, defines, devMode, callback) {
  var appCodeMain = Path.basename(appToLaunch);
  var appCodeDir = Path.dirname(appToLaunch);

  if (devMode)
    Util.log("Building xulrunner app in >" + outputDir + "< ...");

  var templateDir = Path.join(__dirname, "build", "templates");
  createAppTemplate(templateDir, outputDir, devMode, function(err) {
    if (err)
      return callback(err);

    createAppManifest(templateDir, outputDir, appInfo, devMode, function(err) {
      if (err)
        return callback(err);

      getHarnessOptions(templateDir, outputDir, function(err, options) {
        if (err)
          return callback(err);

        placeModules(outputDir, appCodeDir, options.uuid, defines, devMode, function(err) {
          if (err)
            return callback(err);

          // now re-write appinfo
          if (devMode)
            Util.log("  ... writing application info file");

          var appInfoPath = Path.join(outputDir, "app_code", "package.json");
          Fs.writeFile(appInfoPath, JSON.stringify(appInfo, null, 4), function(err) {
            if (err)
              return callback(err);

            // and write harness options
            if (devMode)
              Util.log("  ... writing harness options");

            var harnessPath = Path.join(outputDir, "harness-options.json");
            Fs.writeFile(harnessPath, JSON.stringify(options.data, null, 4), function(err) {
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
        }); // END placeModules
      }); // END getHarnessOptions
    }); // END createAppManifest
  }); // END createAppTemplate
};
