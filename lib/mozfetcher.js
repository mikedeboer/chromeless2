/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Path = require("path");
var Fs = require("fs");
var Crypto = require("crypto");
var Url = require("url");
var Http = require("http");

var Mkdirp = require("mkdirp");
var Multi = require("multimeter");

var Util = require("./util");
var Checksum = require("./checksum");

var fetcher = module.exports = function(buildDir, multiMeter, platform, arch, configPath) {
  buildDir = Path.normalize(buildDir || __dirname);
  configPath = Path.normalize(configPath || Path.join(__dirname, "..", "config", "mozfetcher.json"));
  // Ensure that the top level directory into which we'll install xulrunner exists.
  this._checkBuildDir(buildDir);
  this._buildDir = buildDir;
  this._platform = Util.getPlatform(platform);
  this._arch = arch || process.arch;
  this._configPath = configPath;
  this._config = this._getConfig();
  this._multi = multiMeter;
  // Maybe we want to move this cache dir into a dot directory in the users
  // system?  would this be horrible, or helpful?
  this._cacheDir = Path.join(this._buildDir, "cache");
};

(function() {

this._checkBuildDir = function(buildDir) {
  if (!Fs.statSync(buildDir).isDirectory())
    Mkdirp.sync(buildDir);
};

this._getConfig = function() {
  if (!this._configBlob)
    this._configBlob = JSON.parse(Fs.readFileSync(this._configPath, "utf8"));
  var platformBlob = this._configBlob[this._platform];
  if (!platformBlob) {
    throw "No MozFetcher configuration found for '" + this._platform + "' at "
          "'" + this._configPath + "'";
  }
  var archBlob = platformBlob[this._arch];
  if (!archBlob && platformBlob["all"])
    archBlob = platformBlob["all"];
  if (!archBlob) {
    throw "No MozFetcher configuration found for '" + this._platform + " - " +
          this._arch + "' at '" + this._configPath + "'";
  }
  return archBlob;
};

this.getArchivePath = function() {
  var parsedUrl = Url.parse(this._config.url);
  return Path.join(this._cacheDir, Path.basename(parsedUrl.path));
};

this.getXulrunnerPath = function() {
  return Path.join(this._buildDir, this._config.bin.path);
};

this.needsFetch = function(callback) {
  var want = this._config.bin.sig
  var path = this.getXulrunnerPath();
  Fs.exists(path, function(exists) {
    if (!exists)
      return callback(null, true);

    if (exists && !want) {
      Checksum.calcHash(path, "md5", function(err, md5) {
        if (err)
          return callback(err);
        return callback("No bin/sig setting for '" + path + "'\nHash:\n  " + md5);
      });
    } else {
      Checksum.match(path, want, "md5", function(err, matched, actual) {
        if (err)
          return callback(err);
        callback(null, !matched, "actual: " + actual + ", expected: " + want);
      })
    }
  });
};

this.fetchIfNeeded = function(callback) {
  var self = this;
  this.needsFetch(function(err, needsFetch) {
    if (err)
      return callback(err);
    if (!needsFetch)
      return callback();

    self.fetch(callback);
  });
};

// Actually go out and fetch the tarball, store it under build/cache
this.fetch = function(callback) {
  var url = this._config.url;
  var self = this;
  Fs.exists(this._cacheDir, function(exists) {
    if (!exists) {
      Mkdirp(self._cacheDir, function(err) {
        if (err)
          return callback(err);
        cont();
      });
    } else {
      cont();
    }

    function cont() {
      var parsedUrl = Url.parse(url);
      var tarball = self.getArchivePath();
      // If the tarball has already been downloaded and md5 checks out, don't go
      // fetch it again.
      Fs.exists(tarball, function(exists) {
        if (exists) {
          Checksum.match(tarball, self._config.md5, "md5", function(err, matched) {
            if (err)
              return callback(err);
            if (matched)
              return callback();
            Fs.unlink(tarball, function(err) {
              if (err)
                return callback(err);
              download();
            });
          });
        } else {
          download();
        }

        var progressBar, progressTimer, multi;
        var errored = false;

        function cleanup(err) {
          endProgress();
          Fs.exists(tarball, function(exists) {
            if (!exists) {
              if (errored)
                return;
              errored = !!err;
              return callback(err);
            }
            Fs.unlink(tarball, function(innerErr) {
              err = innerErr || err;
              errored = !!err;
              callback(err);
            });
          });
        }

        function endProgress() {
          if (progressTimer)
            clearInterval(progressTimer);
          if (progressBar) {
            progressBar.percent(100);
          }
        }

        function download() {
          // Now go fetch
          var stream = Fs.createWriteStream(tarball);
          Http.get(url, function(res) {
            var size = res.headers["content-length"] || 0;
            Util.log("Fetching xulrunner, " + (size > 0 ? size + " bytes " : "") +
                     "from " + parsedUrl.host);

            res.pipe(stream);
            stream.on("error", cleanup);
            stream.on("finish", function() {
              endProgress();
              console.log("");

              if (errored)
                return cleanup();

              if (!self._config.md5) {
                Checksum.calcHash(tarball, "md5", function(err, md5) {
                  if (err)
                    return callback(err);
                  Util.log("No md5 listed in _config; for the record:\n" +
                           "  " + md5);
                  callback(null, tarball);
                });
              } else {
                Checksum.match(tarball, self._config.md5, "md5", function(err, matched, actual) {
                  if (err)
                    return cleanup(err);
                  if (!matched) {
                    return cleanup("Download failure! md5 mismatch!\n  " +
                                   "actual: " + actual + ", " +
                                   "expected: " + self._config.md5);
                  } else {
                    callback(null, tarball);
                  }
                });
              }
            });

            // progress bar:
            if (!self._multi)
              return;

            self._multi.drop({width: 72}, function(bar) {
              progressBar = bar;
              progressTimer = setInterval(function() {
                var p = Math.min(Math.floor((stream.bytesWritten / size) * 100), 100);
                bar.percent(p);
                if (p == 100)
                  clearInterval(progressTimer);
              }, 25);
            });
          }).on("error", cleanup);
        }
      });
    }
  });
};

}).call(fetcher.prototype);
