var Path = require("path");
var Fs = require("fs");
var Crypto = require("crypto");
var Url = require("url");
var Http = require("http");
var Tar = require("tar");
var Unzip = require("unzip");
var Zlib = require("zlib");

var Mkdirp = require("mkdirp");
var Multi = require("multimeter");
var BunzipStream = require("./bunzip-stream");

var fetcher = module.exports = function(buildDir, configPath) {
  buildDir = Path.normalize(buildDir || __dirname);
  configPath = Path.normalize(configPath || Path.join(__dirname, "..", "mozfetcher.json"));
  // Ensure that the top level directory into which we'll install
  // xulrunner exists
  this._checkBuildDir(buildDir);
  this._buildDir = buildDir;
  this._configPath = configPath;
  this._config = this._getConfig();
  // Maybe we want to move this cache dir into a dot directory in the users
  // system?  would this be horrible, or helpful?
  this._cacheDir = Path.join(this._buildDir, "cache");
};

(function() {

function calcMd5(path, callback) {
  var hash = Crypto.createHash("md5");
  var stream = Fs.createReadStream(path);
  var errored = false;
  stream.on("data", function(buf) {
    hash.update(buf);
  });
  stream.on("error", function(err) {
    errored = true;
    callback(err);
  });
  stream.on("end", function() {
    if (errored)
      return;
    callback(null, hash.digest("hex"));
  });
}

function matchMd5(path, md5, callback) {
  calcMd5(path, function(err, result) {
    if (err)
      return callback(err);
    callback(null, result == md5, result);
  });
}

this._checkBuildDir = function(buildDir) {
  if (!Fs.statSync(buildDir).isDirectory())
    Mkdirp.sync(buildDir);
};

this._getConfig = function() {
  if (!this._configBlob)
    this._configBlob = JSON.parse(Fs.readFileSync(this._configPath, "utf8"));
  var platformBlob = this._configBlob[process.platform];
  if (!platformBlob) {
    throw "No MozFetcher configuration found for '" + process.platform + "' at "
          "'" + this._configPath + "'";
  }
  var archBlob = platformBlob["all" || process.arch];
  if (!archBlob) {
    throw "No MozFetcher configuration found for '" + process.platform + "-" +
          process.arch + "' at '" + this._configPath + "'";
  }
  return archBlob;
};

this.getArchivePath = function() {
  var parsedUrl = Url.parse(this._config.url);
  return Path.join(this._cacheDir, Path.basename(parsedUrl.path));
};

this.needsFetch = function(callback) {
  var want = this._config.bin.sig
  var path = Path.join(this._buildDir, this._config.bin.path);
  Fs.exists(path, function(exists) {
    if (!exists)
      return callback(null, true);

    if (exists && !want) {
      calcMd5(path, function(err, md5) {
        if (err)
          return callback(err);
        return callback("No bin/sig setting for '" + path + "'\nHash:\n  " + md5);
      });
    } else {
      matchMd5(path, want, function(err, matched, actual) {
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
          matchMd5(tarball, self._config.md5, function(err, matched) {
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
            multi.destroy();
          }
        }

        function download() {
          // Now go fetch
          var stream = Fs.createWriteStream(tarball);
          Http.get(url, function(res) {
            var size = res.headers["content-length"] || 0;
            console.log("Fetching xulrunner, " + (size > 0 ? size + " bytes " : "") +
                        "from " + parsedUrl.host);

            res.pipe(stream);
            stream.on("error", cleanup);
            stream.on("finish", function() {
              endProgress();
              console.log("");

              if (errored)
                return cleanup();

              if (!self._config.md5) {
                calcMd5(tarball, function(err, md5) {
                  if (err)
                    return callback(err);
                  console.log("No md5 listed in _config; for the record:\n" +
                              "  " + md5);
                  callback();
                });
              } else {
                matchMd5(tarball, self._config.md5, function(err, matched, actual) {
                  if (err)
                    return cleanup(err);
                  if (!matched) {
                    return cleanup("Download failure! md5 mismatch!\n  " +
                                   "actual: " + actual + ", " +
                                   "expected: " + self._config.md5);
                  } else {
                    callback();
                  }
                });
              }
            });

            // progress bar:
            multi = Multi(process);
            multi.drop({width: 72}, function(bar) {
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

var TARBALL_RE = /\.(:?tgz|tar\.gz|tbz2|tar\.bz2)$/i;
var ZIP_RE = /\.zip$/i;
var SUPPORTED_ARCHIVES_RE = /\.(:?tgz|tar\.gz|tbz2|tar\.bz2|zip)$/i;

this.unpack = function(path, callback) {
  var self = this;
  Fs.exists(path, function(exists) {
    if (!exists)
      return callback("path doesn't exist, cannot unpack: " + path);

    // Only unpack supported archive types
    if (!SUPPORTED_ARCHIVES_RE.test(path))
      return callback("I don't know how to extract '" + Path.basename(path) + "'");

    console.log("Extracting " + Path.basename(path));
    var input = Fs.createReadStream(path);
    var extracter;
    if (TARBALL_RE.test(path)) {
      extracter = Tar.Extract({path: self._buildDir, strip: 1});

      var transform;
      if (Path.extname(path).indexOf("bz") > -1)
        transform = BunzipStream();
      else
        transform = Zlib.createGunzip();
      transform.on("error", callback);
      input = input.pipe(transform);
    } else if (ZIP_RE.test(path)) {
      extracter = Unzip.Extract({path: self._buildDir});
    }

    extracter.on("error", callback);
    input.pipe(extracter);
    extracter.on("end", function() {
      // If after all that we still think we need to fetch the thing,
      // that means unpacked bits don't match expected signatures.
      // safest to purge them from disk and/or refuse to run
      self.needsFetch(function(err, needsFetch, msg) {
        if (err)
          return callback(err);
        if (needsFetch) {
          return callback("Signature mismatch in unpacked xulrunner contents." +
                          "  Eep!\n" + (msg || ""));
        }
        callback();
      });
    });
  });
};

}).call(fetcher.prototype);
