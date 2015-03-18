/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Async = require("async");
var Ncp = require("ncp").ncp;
var Semver = require("semver");

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
        var dst = Path.join(moduleTargetDir, moduleName);
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

function getAppModulesRecursive(baseDir, modules, callback) {
  if (!modules)
    modules = {};

  var packagePath = Path.join(baseDir, "package.json");
  Fs.exists(packagePath, function(exists) {
    if (!exists)
      return callback(null, modules);

    Fs.readFile(packagePath, {encoding: "utf8"}, function(err, basePackage) {
      if (err)
        return callback(err);

      try {
        basePackage = JSON.parse(basePackage);
      } catch(ex) {
        return callback(ex);
      }

      // For a module to be add it has to pass the following conditions:
      // 1. not be the root module (the 'app'):
      if (baseDir.split("node_modules").length > 1 &&
          // 2. either not be registered as a module yet
          (!modules[basePackage.name] ||
           // 3. OR it's registered, but the current version is lower.
           (modules[basePackage.name] &&
            Semver.compare(modules[basePackage.name].version, basePackage.version) == 1
           ) // END 3.
          ) // END 2.
         ) {
        // Register data to return to the callee about this module.
        var mainScript = "index";
        if (basePackage.main)
          mainScript = Path.normalize(basePackage.main).replace(/[\\]+/g, "/");
        modules[basePackage.name] = {
          version: basePackage.version,
          path: baseDir,
          packageData: basePackage,
          main: basePackage.name + "/" + mainScript
        };
      }

      baseDir = Path.join(baseDir, "node_modules");
      Fs.exists(baseDir, function(exists) {
        if (!exists)
          return callback(null, modules);

        Fs.readdir(baseDir, function(err, nodes) {
          if (err)
            return callback(err);

          // If a file node is not in the package.json dependencies map, it's not
          // a valid module.
          nodes = nodes.filter(function(node) {
            return (node in basePackage.dependencies);
          });
          Async.eachSeries(nodes, function(node, nextNode) {
            getAppModulesRecursive(Path.join(baseDir, node), modules, nextNode);
          }, function(err) {
            if (err)
              return callback(err);
            callback(null, modules);
          });
        }); // END Fs.readdir
      }); // END Fs.exists
    }); // END Fs.readFile
  }); // END Fs.exists
}

exports.placeAppModules = function(appInfo, appCodeDir, moduleTargetDir, uuid, devMode, callback) {
  getAppModulesRecursive(appCodeDir, null, function(err, moduleMappings) {
    if (err)
      return callback(err);

    var modules = Object.keys(moduleMappings);
    if (!modules.length)
      return callback(null, moduleMappings);

    if (devMode)
      Util.log("  ... copying in NPM modules");

    Async.eachSeries(modules, function(moduleName, nextModule) {
      var module = moduleMappings[moduleName];
      module.dir = uuid + "-" + moduleName;
      Ncp(module.path, Path.join(moduleTargetDir, module.dir), nextModule);
    }, function(err) {
      if (err)
        return callback(err);
      return callback(null, moduleMappings);
    });
  });
};

exports.placeAppCode = function(appCodeDir, outputDir, devMode, callback) {
  if (devMode)
    Util.log("  ... copying in app code (" + appCodeDir + ")");
  Ncp(appCodeDir, Path.join(outputDir, "app_code"), {
    filter: function(subject) {
      // NPM modules are handled by another code path...
      return subject.indexOf("node_modules") === -1;
    }
  }, callback);
};
