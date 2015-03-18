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

var Util = require("./util");
var Checksum = require("./checksum");
var Moztarball = require("./moztarball");
var Promise = require('promise');
var ProgressBar = require('progress');

var fetcher = module.exports = function(buildDir, platform, arch, configPath) {
  buildDir = Path.normalize(buildDir || __dirname);
  configPath = Path.normalize(configPath || Path.join(__dirname, "..", "config", "mozfetcher.json"));
  // Ensure that the top level directory into which we'll install xulrunner exists.
  Moztarball.prototype._checkBuildDir(buildDir);
  this._buildDir = buildDir;
  this._platform = Util.getPlatform(platform);
  this._arch = arch || process.arch;
  this._configPath = configPath;
  this._config = this._getConfig();
  // Maybe we want to move this cache dir into a dot directory in the users
  // system?  would this be horrible, or helpful?
  this._cacheDir = Path.join(this._buildDir, "cache");
};

(function() {

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

function splitPath(path) {
  return Path.normalize(path).split(Path.sep)
}

this.getExtractedMd5Path = function() {
  return Path.join(this._buildDir, splitPath(this._config.bin.path)[0] + ".md5");
}

/* callback(error, needsFetch) */
this.needsFetch = function(callback) {
  var self = this;
  Mkdirp(self._cacheDir, function(err) {
    if (err) {
      return callback(err, false)
    }
    self.downloadArchive(function(err) {
      if (err) {
        return callback(err, false)
      }
      var path = self.getXulrunnerPath();
      var extractedMd5 = self.getExtractedMd5Path()
      var readedMd5;
      if (Fs.existsSync(extractedMd5)) {
        readedMd5 = Fs.readFileSync(extractedMd5, "utf8");
      }

      if (readedMd5 != self._config.md5) {
        return callback(null, true)
      }

      Fs.exists(path, function(exists) {
        if (!exists)
          return callback(null, true);
        return callback(null, false);
      });
    });
  });
};

this.fetchIfNeeded = function(callback) {
  var self = this;
  self.needsFetch(function(err, needsFetch) {
    if (err)
      return callback(err);
    if (!needsFetch)
      return callback();
    new Moztarball(self._buildDir).unpack(self.getArchivePath(), function(err) {
      if (err) {
        return callback(err);
      }
      Fs.writeFile(self.getExtractedMd5Path(), self._config.md5, "utf8", callback)
    });
  });
};

this.downloadArchive = function(callback) {
  var self = this;
  var url = this._config.url;
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
          self.download(url, tarball, callback);
        });
      });
    } else {
      self.download(url, tarball, callback);
    }
  });
}

this.download = function(url, tarball, callback) {
  var parsedUrl = Url.parse(url);
  var errored = false;
  function cleanup(err) {
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

  // Now go fetch
  var stream = Fs.createWriteStream(tarball);

  Http.get(url, function(res) {
    var size = res.headers["content-length"] || 0;
    Util.log("Fetching xulrunner, " + (size > 0 ? size + " bytes " : "") +
             "from " + parsedUrl.host);

    res.pipe(stream);
    stream.on("error", cleanupProgress);
    stream.on("finish", function() {
      endProgress();
      console.log("");

      if (errored)
        return cleanupProgress();

      if (!self._config.md5) {
        Checksum.calcHash(tarball, "md5", function(err, md5) {
          if (err)
            return callback(err);
          Util.log("No md5 listed in _config; for the record:\n" +
                   "  " + md5);
          callback(null);
        });
      } else {
        Checksum.match(tarball, self._config.md5, "md5", function(err, matched, actual) {
          if (err)
            return cleanupProgress(err);
          if (!matched) {
            return cleanupProgress("Download failure! md5 mismatch!\n  " +
                           "actual: " + actual + ", " +
                           "expected: " + self._config.md5);
          } else {
            callback(null);
          }
        });
      }
    });

    var progressBar = new ProgressBar('  Downloading [:bar] :percent :etas', { width:78, total: parseInt(size) });
    var progressTimer = setInterval(function() {
      var p = stream.bytesWritten / size;
      progressBar.update(p);
      if (stream.bytesWritten == size) {
        endProgress();
      }
    }, 1000);

    function cleanupProgress(err) {
      endProgress();
      cleanup(err);
    }

    function endProgress() {
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      if (progressBar) {
        progressBar.terminate();
      }
    }
  }).on("error", cleanup);
}

}).call(fetcher.prototype);
