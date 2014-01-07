/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Async = require("async");
var Ncp = require("ncp").ncp;

var Defines = require("./defines");
var Util = require("./../util");

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

exports.place = function(config, appInfo, outputDir, appCodeDir, uuid, defines, devMode, callback) {
  var moduleTargetDir = Path.join(outputDir, "modules");
  // Place built-in modules located at `../../modules/`
  exports.placeBuiltinModules(config, moduleTargetDir, uuid, defines, devMode, function(err) {
    if (err)
      return callback(err);

    // Place apps' own CommonJS modules
    exports.placeAppModules(appInfo, appCodeDir, moduleTargetDir, uuid, devMode, function(err, moduleMappings) {
      if (err)
        return callback(err);

      // And app code
      exports.placeAppCode(appCodeDir, outputDir, devMode, function(err) {
        callback(err, moduleMappings);
      });
    });
  });
};

exports.placeBuiltinModules = function(config, moduleTargetDir, uuid, defines, devMode, callback) {
  if (devMode)
    Util.log("  ... copying in CommonJS modules");

  var moduleSourceDir = Path.normalize(Path.join(__dirname, "..", "..", "modules"));
  
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
      }, callback); // END eachSeries(modules)
  }); // END mkdir
};

exports.placeAppModules = function(appInfo, appCodeDir, moduleTargetDir, uuid, devMode, callback) {
  var moduleMappings = {};
  console.log(appInfo);
  var modules = appInfo.dependencies && Object.keys(appInfo.dependencies);
  if (!modules || !modules.length)
    return callback(null, moduleMappings);

  if (devMode)
    Util.log("  ... copying in CommonJS modules");

  Async.eachSeries(modules, function(moduleName, nextModule) {
    var moduleSourceDir = Path.join(appCodeDir, "node_modules", moduleName);
    var packagePath = Path.join(moduleSourceDir, "package.json");
    Fs.exists(packagePath, function(exists) {
      if (!exists)
        return nextModule();

      Fs.readFile(packagePath, {encoding: "utf8"}, function(err, packageData) {
        if (err)
          return nextModule(err);
        try {
          packageData = JSON.parse(packageData);
        } catch (ex) {
          return callback(ex.message);
        }

        // Module exists! Copy it to the package directory:
        var moduleDir = uuid + "-" + moduleName;
        Ncp(moduleSourceDir, Path.join(moduleTargetDir, moduleDir), function(err) {
          if (err)
            return nextModule(err);

          // Register data to return to the callee about this module.
          var mainScript = "index";
          if (packageData.main)
            mainScript = Path.normalize(packageData.main);
          moduleMappings[moduleName] = {
            dir: moduleDir,
            path: [Path.basename(moduleTargetDir), moduleDir],
            main: moduleName + "/" + mainScript
          };

          nextModule();
        });
      });
    });
  }, function(err) {
    if (err)
      return callback(err);
    return callback(null, moduleMappings);
  });
};

exports.placeAppCode = function(appCodeDir, outputDir, devMode, callback) {
  if (devMode)
    Util.log("  ... copying in app code (" + appCodeDir + ")");
  Ncp(appCodeDir, Path.join(outputDir, "app_code"), {
    filter: function(subject) {
      return subject.indexOf("node_modules") === -1;
    }
  }, callback);
};
