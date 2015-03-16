/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Async = require("async");
var Ncp = require("ncp").ncp;
var Uuid = require("uuid");

var Template = require("./../template");
var Util = require("./../util");

function createAppManifest(templateDir, outputDir, appInfo, devMode, callback) {
  // sub in application.ini
  if (devMode)
    Util.log("  ... creating application.ini");

  var appIniTemplate = Path.join(templateDir, "application.ini.template");
  var appIniPath = Path.join(outputDir, "application.ini");

  Template.subAndCopy(appIniTemplate, appIniPath, {
    "application_name": appInfo.title,
    "application_shortname": appInfo.name,
    "application_vendor": appInfo.vendor,
    "short_version": appInfo.version,
    "build_id": appInfo.build_id,
    "developer_email": appInfo.developer_email
  }, callback);
}

function getTemplateDir() {
  return Path.join(__dirname, "templates");
}

exports.create = function(outputDir, appInfo, devMode, callback) {
  var templateDir = getTemplateDir();
  // Copy all the template files which require no substitution.
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
      }, function(err) {
        if (err)
          return callback(err);

        createAppManifest(templateDir, outputDir, appInfo, devMode, function(err) {
          if (err)
            return callback(err);
          callback(null, templateDir);
        });
      });
  });
}

exports.getHarnessOptions = function(outputDir, callback) {
  var templateDir = getTemplateDir();
  var harnessTemplate = Path.join(templateDir, "harness-options.json.template");

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

